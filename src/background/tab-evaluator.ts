import { isSplitViewTab } from "../browser/chrome-types";
import type { MutationTracker } from "../core/mutation-tracker";
import { findMatchingRule } from "../core/rule-matcher";
import type { KeyedMutex } from "../core/scheduler";
import { TAB_GROUP_ID_NONE, type ExtensionSettings, type TabStateRecord } from "../core/types";
import type { OwnedGroupRegistry } from "./owned-group-registry";
import type { TabStateStore } from "./tab-state-store";

/**
 * TabEvaluator がコントローラー等から受け取るコールバック・設定取得の依存インターフェース。
 */
export interface TabEvaluatorDeps {
  readonly getSettings: () => Promise<ExtensionSettings>;
  readonly isWindowSplitSettling: (windowId: number) => boolean;
  readonly windowHasSplitView: (windowId: number) => Promise<boolean>;
  readonly scheduleEvaluation: (tabId: number, delayMs: number) => void;
}

/**
 * 単一タブのルール照合、グループ変更分類、不一致タブの解除を担当する評価クラス。
 * 直接呼び出す chrome API は tabs.get, tabs.group, tabs.ungroup の3種に限定される。
 */
export class TabEvaluator {
  readonly #tabStates: TabStateStore;
  readonly #ownedGroups: OwnedGroupRegistry;
  readonly #mutations: MutationTracker;
  readonly #windowMutex: KeyedMutex<number>;
  readonly #deps: TabEvaluatorDeps;

  constructor(
    tabStates: TabStateStore,
    ownedGroups: OwnedGroupRegistry,
    mutations: MutationTracker,
    windowMutex: KeyedMutex<number>,
    deps: TabEvaluatorDeps,
  ) {
    this.#tabStates = tabStates;
    this.#ownedGroups = ownedGroups;
    this.#mutations = mutations;
    this.#windowMutex = windowMutex;
    this.#deps = deps;
  }

  /**
   * 1タブのURLと状態を評価し、適切な所有グループへの配置または解除を行う。
   */
  async evaluateTab(tabId: number): Promise<void> {
    const settings = await this.#deps.getSettings();
    if (!settings.enabled) return;
    let tab: chrome.tabs.Tab;
    try {
      tab = await chrome.tabs.get(tabId);
    } catch {
      return;
    }
    if (tab.id === undefined || tab.windowId === undefined) return;
    let current = this.#tabStates.get(tabId);
    if (current.state === "protected-user") return;

    if (isSplitViewTab(tab)) {
      await this.#tabStates.apply(tabId, { type: "split-entered", at: Date.now() });
      return;
    }

    if (tab.pinned) {
      await this.#tabStates.apply(tabId, { type: "pinned", at: Date.now() });
      return;
    }

    if (tab.groupId !== undefined && tab.groupId !== TAB_GROUP_ID_NONE) {
      const owned = this.#ownedGroups.get(tab.groupId);
      if (!owned) {
        if (current.state !== "protected-external") {
          await this.#tabStates.apply(tabId, { type: "external-group", at: Date.now() });
        }
        return;
      }
    }

    if (current.state === "protected-external") {
      current = await this.#tabStates.apply(tabId, { type: "external-left", at: Date.now() });
    }

    if (!tab.url || !/^https?:/i.test(tab.url)) {
      await this.markRuleUnmatched(tab, current);
      return;
    }

    const rule = findMatchingRule(tab.url, settings.rules);
    if (!rule) {
      await this.markRuleUnmatched(tab, current);
      return;
    }

    const windowId = tab.windowId;
    await this.#windowMutex.run(windowId, async () => {
      if (await this.#deps.windowHasSplitView(windowId)) return;
      const result = await this.#ownedGroups.getOrCreateOwnedGroup(windowId, tabId, rule);
      if (!result.createdWithTab && tab.groupId !== result.group.groupId) {
        this.#mutations.begin(tabId, "group", 3000, result.group.groupId);
        await chrome.tabs.group({ tabIds: [tabId], groupId: result.group.groupId });
      }
      await this.#tabStates.apply(tabId, {
        type: "rule-matched",
        ruleId: rule.id,
        at: Date.now(),
      });
    });
  }

  /**
   * ルールに一致しないタブ、または非HTTP(S)URLのタブを所有グループから外す。
   */
  async markRuleUnmatched(tab: chrome.tabs.Tab, _current: TabStateRecord): Promise<void> {
    if (tab.id === undefined) return;

    if (
      tab.groupId !== undefined &&
      tab.groupId !== TAB_GROUP_ID_NONE &&
      this.#ownedGroups.has(tab.groupId)
    ) {
      this.#mutations.begin(tab.id, "ungroup", 3000, TAB_GROUP_ID_NONE);
      try {
        await chrome.tabs.ungroup(tab.id);
      } catch {
        this.#mutations.clear(tab.id);
      }
    }

    await this.#tabStates.apply(tab.id, { type: "rule-unmatched", at: Date.now() });
  }

  /**
   * 拡張機能の意図しないタブグループ変更を分類し、保護または再評価のスケジュールを行う。
   */
  async classifyUnplannedGroupChange(tabId: number): Promise<void> {
    let tab: chrome.tabs.Tab;
    try {
      tab = await chrome.tabs.get(tabId);
    } catch {
      return;
    }
    if (isSplitViewTab(tab) || this.#deps.isWindowSplitSettling(tab.windowId)) {
      if (isSplitViewTab(tab)) {
        await this.#tabStates.apply(tabId, { type: "split-entered", at: Date.now() });
      }
      return;
    }

    if (
      tab.groupId !== undefined &&
      tab.groupId !== TAB_GROUP_ID_NONE &&
      !this.#ownedGroups.has(tab.groupId)
    ) {
      await this.#tabStates.apply(tabId, { type: "external-group", at: Date.now() });
      return;
    }

    const current = this.#tabStates.get(tabId);
    if (current.state === "protected-external") {
      await this.#tabStates.apply(tabId, { type: "external-left", at: Date.now() });
    }
    this.#deps.scheduleEvaluation(tabId, 0);
  }
}
