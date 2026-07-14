import { changedSplitViewId, isSplitViewTab } from "../browser/chrome-types";
import { MutationTracker } from "../core/mutation-tracker";
import { findMatchingRule } from "../core/rule-matcher";
import { KeyedMutex, KeyedScheduler } from "../core/scheduler";
import { initialTabState, reduceTabState } from "../core/state-machine";
import {
  TAB_GROUP_ID_NONE,
  type ExtensionSettings,
  type GroupColor,
  type OwnedGroup,
  type TabStateRecord,
} from "../core/types";
import { ExtensionStorage } from "./storage";

const MENU_RETURN = "autogrouping:return";
const MENU_PROTECT = "autogrouping:protect";
const MENU_REEVALUATE = "autogrouping:reevaluate-window";

export class AutoGroupingController {
  readonly #storage = new ExtensionStorage();
  readonly #mutations = new MutationTracker();
  readonly #tabScheduler = new KeyedScheduler<number>();
  readonly #groupChangeScheduler = new KeyedScheduler<number>();
  readonly #windowScheduler = new KeyedScheduler<number>();
  readonly #windowMutex = new KeyedMutex<number>();
  readonly #tabStates = new Map<number, TabStateRecord>();
  readonly #ownedGroups = new Map<number, OwnedGroup>();
  readonly #splitSettlingWindows = new Set<number>();
  #settings: ExtensionSettings | undefined;

  async start(): Promise<void> {
    this.#settings = await this.#storage.getSettings();
    for (const [id, state] of await this.#storage.getTabStates()) this.#tabStates.set(id, state);
    for (const [id, group] of await this.#storage.getOwnedGroups())
      this.#ownedGroups.set(id, group);
    await this.#installMenus();
    this.#registerListeners();
    await this.#recoverOwnedGroupsAtStartup();
    await this.#reconcileStartup();
  }

  #registerListeners(): void {
    chrome.tabs.onCreated.addListener((tab) => {
      if (tab.id === undefined) return;
      this.#tabStates.set(tab.id, initialTabState(tab.id));
      void this.#persistTabStates();
      this.#scheduleEvaluation(tab.id, 0);
    });

    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      const splitViewId = changedSplitViewId(changeInfo);
      if (splitViewId !== undefined) {
        void this.#handleSplitViewChange(tab, splitViewId);
        return;
      }
      if (changeInfo.groupId !== undefined) {
        void this.#handleGroupChange(tabId, changeInfo.groupId);
        return;
      }
      if (
        changeInfo.url !== undefined ||
        changeInfo.status === "complete" ||
        changeInfo.pinned !== undefined
      ) {
        this.#scheduleEvaluation(tabId, 100);
      }
    });

    chrome.tabs.onRemoved.addListener((tabId) => {
      this.#tabScheduler.cancel(tabId);
      this.#groupChangeScheduler.cancel(tabId);
      this.#mutations.clear(tabId);
      this.#tabStates.delete(tabId);
      void this.#persistTabStates();
    });

    chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
      const prior = this.#tabStates.get(removedTabId);
      this.#tabStates.delete(removedTabId);
      if (prior)
        this.#tabStates.set(addedTabId, { ...prior, tabId: addedTabId, updatedAt: Date.now() });
      this.#scheduleEvaluation(addedTabId, 0);
      void this.#persistTabStates();
    });

    chrome.tabs.onAttached.addListener((tabId) => this.#scheduleEvaluation(tabId, 0));
    chrome.tabs.onDetached.addListener((tabId) => this.#tabScheduler.cancel(tabId));

    chrome.tabGroups.onRemoved.addListener((group) => {
      this.#ownedGroups.delete(group.id);
      void this.#persistOwnedGroups();
    });

    chrome.tabGroups.onUpdated.addListener((group) => {
      void this.#handleOwnedGroupMetadataChange(group);
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === "sync" && changes.settings) {
        void this.#reloadSettingsAndEvaluate();
      }
    });

    chrome.contextMenus.onClicked.addListener((info, tab) => {
      if (tab?.id === undefined) return;
      if (info.menuItemId === MENU_RETURN) void this.returnTabToAutomation(tab.id);
      if (info.menuItemId === MENU_PROTECT) void this.protectTab(tab.id);
      if (info.menuItemId === MENU_REEVALUATE && tab.windowId !== undefined)
        void this.reevaluateWindow(tab.windowId);
    });

    chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
      void this.#handleMessage(message).then(sendResponse);
      return true;
    });
  }

  async #handleMessage(message: unknown): Promise<unknown> {
    if (typeof message !== "object" || message === null || !("type" in message))
      return { ok: false };
    const typed = message as { type: string; tabId?: number; windowId?: number };
    if (typed.type === "get-status" && typed.tabId !== undefined) {
      return { ok: true, state: this.#tabStates.get(typed.tabId) ?? initialTabState(typed.tabId) };
    }
    if (typed.type === "return-tab" && typed.tabId !== undefined) {
      await this.returnTabToAutomation(typed.tabId);
      return { ok: true };
    }
    if (typed.type === "protect-tab" && typed.tabId !== undefined) {
      await this.protectTab(typed.tabId);
      return { ok: true };
    }
    if (typed.type === "reevaluate-window" && typed.windowId !== undefined) {
      await this.reevaluateWindow(typed.windowId);
      return { ok: true };
    }
    return { ok: false };
  }

  async protectTab(tabId: number): Promise<void> {
    const current = this.#tabStates.get(tabId) ?? initialTabState(tabId);
    this.#tabStates.set(tabId, reduceTabState(current, { type: "user-protect", at: Date.now() }));
    await this.#persistTabStates();
  }

  async #markExternalGroup(tabId: number): Promise<void> {
    const current = this.#tabStates.get(tabId) ?? initialTabState(tabId);
    this.#tabStates.set(tabId, reduceTabState(current, { type: "external-group", at: Date.now() }));
    await this.#persistTabStates();
  }

  async returnTabToAutomation(tabId: number): Promise<void> {
    let tab: chrome.tabs.Tab;
    try {
      tab = await chrome.tabs.get(tabId);
    } catch {
      return;
    }
    if (isSplitViewTab(tab)) return;
    if (tab.groupId !== TAB_GROUP_ID_NONE && !this.#ownedGroups.has(tab.groupId)) {
      this.#mutations.begin(tabId, "ungroup", 3000, TAB_GROUP_ID_NONE);
      await chrome.tabs.ungroup(tabId);
    }
    const current = this.#tabStates.get(tabId) ?? initialTabState(tabId);
    this.#tabStates.set(tabId, reduceTabState(current, { type: "manual-reset", at: Date.now() }));
    await this.#persistTabStates();
    this.#scheduleEvaluation(tabId, 0);
  }

  async reevaluateWindow(windowId: number): Promise<void> {
    const tabs = await chrome.tabs.query({ windowId });
    for (const tab of tabs) if (tab.id !== undefined) this.#scheduleEvaluation(tab.id, 0);
  }

  #scheduleEvaluation(tabId: number, delayMs: number): void {
    this.#tabScheduler.schedule(tabId, delayMs, () => this.#evaluateTab(tabId));
  }

  async #evaluateTab(tabId: number): Promise<void> {
    const settings = this.#settings ?? (await this.#storage.getSettings());
    if (!settings.enabled) return;
    let tab: chrome.tabs.Tab;
    try {
      tab = await chrome.tabs.get(tabId);
    } catch {
      return;
    }
    if (tab.id === undefined || tab.windowId === undefined) return;
    let current = this.#tabStates.get(tabId) ?? initialTabState(tabId);
    if (current.state === "protected-user") return;

    if (isSplitViewTab(tab)) {
      this.#tabStates.set(
        tabId,
        reduceTabState(current, { type: "split-entered", at: Date.now() }),
      );
      await this.#persistTabStates();
      return;
    }

    if (tab.pinned) {
      this.#tabStates.set(tabId, reduceTabState(current, { type: "pinned", at: Date.now() }));
      await this.#persistTabStates();
      return;
    }

    if (tab.groupId !== undefined && tab.groupId !== TAB_GROUP_ID_NONE) {
      const owned = this.#ownedGroups.get(tab.groupId);
      if (!owned) {
        if (current.state !== "protected-external") await this.#markExternalGroup(tabId);
        return;
      }
    }

    if (current.state === "protected-external") {
      current = reduceTabState(current, { type: "external-left", at: Date.now() });
      this.#tabStates.set(tabId, current);
    }

    if (!tab.url || !/^https?:/i.test(tab.url)) {
      await this.#markRuleUnmatched(tab, current);
      return;
    }

    const rule = findMatchingRule(tab.url, settings.rules);
    if (!rule) {
      await this.#markRuleUnmatched(tab, current);
      return;
    }

    await this.#windowMutex.run(tab.windowId, async () => {
      if (await this.#windowHasSplitView(tab.windowId)) return;
      const result = await this.#getOrCreateOwnedGroup(
        tab.windowId,
        tabId,
        rule.id,
        rule.name,
        rule.color,
      );
      if (!result.createdWithTab && tab.groupId !== result.group.groupId) {
        this.#mutations.begin(tabId, "group", 3000, result.group.groupId);
        await chrome.tabs.group({ tabIds: [tabId], groupId: result.group.groupId });
      }
      this.#tabStates.set(
        tabId,
        reduceTabState(current, { type: "rule-matched", ruleId: rule.id, at: Date.now() }),
      );
      await this.#persistTabStates();
    });
  }

  async #markRuleUnmatched(tab: chrome.tabs.Tab, current: TabStateRecord): Promise<void> {
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

    this.#tabStates.set(
      tab.id,
      reduceTabState(current, { type: "rule-unmatched", at: Date.now() }),
    );
    await this.#persistTabStates();
  }

  async #getOrCreateOwnedGroup(
    windowId: number,
    tabId: number,
    ruleId: string,
    title: string,
    color: GroupColor,
  ): Promise<{ group: OwnedGroup; createdWithTab: boolean }> {
    const existing = [...this.#ownedGroups.values()].find(
      (group) => group.windowId === windowId && group.ruleId === ruleId,
    );
    if (existing) {
      try {
        const browserGroup = await chrome.tabGroups.get(existing.groupId);
        if (browserGroup.title !== title || browserGroup.color !== color) {
          await chrome.tabGroups.update(existing.groupId, { title, color });
        }
        return { group: existing, createdWithTab: false };
      } catch {
        this.#ownedGroups.delete(existing.groupId);
      }
    }

    this.#mutations.begin(tabId, "group", 3000);
    const groupId = await chrome.tabs.group({ tabIds: [tabId], createProperties: { windowId } });
    await chrome.tabGroups.update(groupId, { title, color });
    const owned: OwnedGroup = { windowId, groupId, ruleId, createdAt: Date.now() };
    this.#ownedGroups.set(groupId, owned);
    await this.#storage.addKnownOwnedRuleId(ruleId);
    await this.#persistOwnedGroups();
    return { group: owned, createdWithTab: true };
  }

  async #handleGroupChange(tabId: number, groupId: number): Promise<void> {
    const mutation = this.#mutations.consume(
      tabId,
      groupId === TAB_GROUP_ID_NONE ? "ungroup" : "group",
      groupId,
    );
    if (mutation) return;
    this.#groupChangeScheduler.schedule(tabId, 100, () =>
      this.#classifyUnplannedGroupChange(tabId),
    );
  }

  async #classifyUnplannedGroupChange(tabId: number): Promise<void> {
    let tab: chrome.tabs.Tab;
    try {
      tab = await chrome.tabs.get(tabId);
    } catch {
      return;
    }
    if (isSplitViewTab(tab) || this.#splitSettlingWindows.has(tab.windowId)) {
      const current = this.#tabStates.get(tabId) ?? initialTabState(tabId);
      if (isSplitViewTab(tab)) {
        this.#tabStates.set(
          tabId,
          reduceTabState(current, { type: "split-entered", at: Date.now() }),
        );
        await this.#persistTabStates();
      }
      return;
    }

    if (
      tab.groupId !== undefined &&
      tab.groupId !== TAB_GROUP_ID_NONE &&
      !this.#ownedGroups.has(tab.groupId)
    ) {
      await this.#markExternalGroup(tabId);
      return;
    }

    const current = this.#tabStates.get(tabId) ?? initialTabState(tabId);
    if (current.state === "protected-external") {
      this.#tabStates.set(
        tabId,
        reduceTabState(current, { type: "external-left", at: Date.now() }),
      );
      await this.#persistTabStates();
    }
    this.#scheduleEvaluation(tabId, 0);
  }

  async #handleOwnedGroupMetadataChange(group: chrome.tabGroups.TabGroup): Promise<void> {
    const owned = this.#ownedGroups.get(group.id);
    if (!owned) return;
    const settings = this.#settings ?? (await this.#storage.getSettings());
    const rule = settings.rules.find((candidate) => candidate.id === owned.ruleId);
    if (rule && group.title === rule.name && group.color === rule.color) return;

    this.#ownedGroups.delete(group.id);
    await this.#persistOwnedGroups();
    const tabs = await chrome.tabs.query({ windowId: group.windowId, groupId: group.id });
    await Promise.all(
      tabs.flatMap((tab) => (tab.id === undefined ? [] : [this.#markExternalGroup(tab.id)])),
    );
  }

  async #handleSplitViewChange(tab: chrome.tabs.Tab, splitViewId: number): Promise<void> {
    if (tab.id === undefined || tab.windowId === undefined) return;
    const current = this.#tabStates.get(tab.id) ?? initialTabState(tab.id);
    if (splitViewId !== -1) {
      this.#splitSettlingWindows.add(tab.windowId);
      this.#tabStates.set(
        tab.id,
        reduceTabState(current, { type: "split-entered", at: Date.now() }),
      );
      this.#tabScheduler.cancel(tab.id);
      await this.#persistTabStates();
      return;
    }
    this.#tabStates.set(tab.id, reduceTabState(current, { type: "split-left", at: Date.now() }));
    await this.#persistTabStates();
    this.#windowScheduler.schedule(
      tab.windowId,
      this.#settings?.splitViewSettleDelayMs ?? 500,
      async () => {
        this.#splitSettlingWindows.delete(tab.windowId);
        await this.reevaluateWindow(tab.windowId);
      },
    );
  }

  async #windowHasSplitView(windowId: number): Promise<boolean> {
    const tabs = await chrome.tabs.query({ windowId });
    return tabs.some(isSplitViewTab);
  }

  async #recoverOwnedGroupsAtStartup(): Promise<void> {
    const settings = this.#settings ?? (await this.#storage.getSettings());
    const groups = await chrome.tabGroups.query({});
    const knownOwnedRuleIds = await this.#storage.getKnownOwnedRuleIds();
    const recovered = new Map<number, OwnedGroup>();

    for (const group of groups) {
      const tabs = await chrome.tabs.query({ windowId: group.windowId, groupId: group.id });
      if (tabs.length === 0 || tabs.some(isSplitViewTab)) continue;
      const candidates = settings.rules.filter((rule) => {
        if (!knownOwnedRuleIds.has(rule.id)) return false;
        if (!rule.enabled || rule.name !== group.title || rule.color !== group.color) return false;
        return tabs.every((tab) => Boolean(tab.url && findMatchingRule(tab.url, [rule])));
      });
      if (candidates.length !== 1) continue;
      const rule = candidates[0];
      if (!rule) continue;
      recovered.set(group.id, {
        windowId: group.windowId,
        groupId: group.id,
        ruleId: rule.id,
        createdAt: Date.now(),
      });
    }

    this.#ownedGroups.clear();
    for (const [groupId, group] of recovered) this.#ownedGroups.set(groupId, group);
    await this.#persistOwnedGroups();
  }

  async #reconcileStartup(): Promise<void> {
    const tabs = await chrome.tabs.query({});
    const liveIds = new Set(tabs.flatMap((tab) => (tab.id === undefined ? [] : [tab.id])));
    for (const tabId of this.#tabStates.keys())
      if (!liveIds.has(tabId)) this.#tabStates.delete(tabId);

    for (const tab of tabs) {
      if (tab.id === undefined) continue;
      if (isSplitViewTab(tab)) {
        const current = this.#tabStates.get(tab.id) ?? initialTabState(tab.id);
        this.#tabStates.set(
          tab.id,
          reduceTabState(current, { type: "split-entered", at: Date.now() }),
        );
      } else if (
        tab.groupId !== undefined &&
        tab.groupId !== TAB_GROUP_ID_NONE &&
        !this.#ownedGroups.has(tab.groupId)
      ) {
        await this.#markExternalGroup(tab.id);
      } else {
        const current = this.#tabStates.get(tab.id);
        if (current?.state === "protected-external") {
          this.#tabStates.set(
            tab.id,
            reduceTabState(current, { type: "external-left", at: Date.now() }),
          );
        }
        this.#scheduleEvaluation(tab.id, 0);
      }
    }
    await this.#persistTabStates();
  }

  async #reloadSettingsAndEvaluate(): Promise<void> {
    this.#settings = await this.#storage.getSettings();
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) if (tab.id !== undefined) this.#scheduleEvaluation(tab.id, 0);
  }

  async #installMenus(): Promise<void> {
    await chrome.contextMenus.removeAll();
    chrome.contextMenus.create({
      id: MENU_RETURN,
      title: "Return this tab to AutoGrouping",
      contexts: ["page"],
    });
    chrome.contextMenus.create({
      id: MENU_PROTECT,
      title: "Protect this tab from AutoGrouping",
      contexts: ["page"],
    });
    chrome.contextMenus.create({
      id: MENU_REEVALUATE,
      title: "Re-evaluate this window",
      contexts: ["page"],
    });
  }

  async #persistTabStates(): Promise<void> {
    await this.#storage.setTabStates(this.#tabStates);
  }

  async #persistOwnedGroups(): Promise<void> {
    await this.#storage.setOwnedGroups(this.#ownedGroups);
  }
}
