import { MutationTracker } from "../core/mutation-tracker";
import { findMatchingRule } from "../core/rule-matcher";
import { initialTabState, reduceTabState } from "../core/state-machine";
import { KeyedMutex, KeyedScheduler } from "../core/scheduler";
import { TAB_GROUP_ID_NONE, type ExtensionSettings, type OwnedGroup, type TabStateRecord } from "../core/types";
import { changedSplitViewId, isSplitViewTab } from "../browser/chrome-types";
import { ExtensionStorage } from "./storage";

const MENU_RETURN = "autogrouping:return";
const MENU_PROTECT = "autogrouping:protect";
const MENU_REEVALUATE = "autogrouping:reevaluate-window";

export class AutoGroupingController {
  readonly #storage = new ExtensionStorage();
  readonly #mutations = new MutationTracker();
  readonly #tabScheduler = new KeyedScheduler<number>();
  readonly #windowScheduler = new KeyedScheduler<number>();
  readonly #windowMutex = new KeyedMutex<number>();
  readonly #tabStates = new Map<number, TabStateRecord>();
  readonly #ownedGroups = new Map<number, OwnedGroup>();
  #settings: ExtensionSettings | undefined;

  async start(): Promise<void> {
    this.#settings = await this.#storage.getSettings();
    for (const [id, state] of await this.#storage.getTabStates()) this.#tabStates.set(id, state);
    for (const [id, group] of await this.#storage.getOwnedGroups()) this.#ownedGroups.set(id, group);
    await this.#installMenus();
    this.#registerListeners();
    await this.#reconcileStartup();
  }

  #registerListeners(): void {
    chrome.tabs.onCreated.addListener((tab) => {
      if (tab.id === undefined) return;
      this.#tabStates.set(tab.id, initialTabState(tab.id));
      void this.#persistTabStates();
      this.#scheduleEvaluation(tab.id, this.#settings?.newTabGracePeriodMs ?? 1000);
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
      if (changeInfo.url !== undefined || changeInfo.status === "complete" || changeInfo.pinned !== undefined) {
        this.#scheduleEvaluation(tabId, 100);
      }
    });

    chrome.tabs.onRemoved.addListener((tabId) => {
      this.#tabScheduler.cancel(tabId);
      this.#mutations.clear(tabId);
      this.#tabStates.delete(tabId);
      void this.#persistTabStates();
    });

    chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
      const prior = this.#tabStates.get(removedTabId);
      this.#tabStates.delete(removedTabId);
      if (prior) this.#tabStates.set(addedTabId, { ...prior, tabId: addedTabId, updatedAt: Date.now() });
      this.#scheduleEvaluation(addedTabId, 100);
      void this.#persistTabStates();
    });

    chrome.tabs.onAttached.addListener((tabId) => this.#scheduleEvaluation(tabId, 200));
    chrome.tabs.onDetached.addListener((tabId) => this.#tabScheduler.cancel(tabId));

    chrome.tabGroups.onRemoved.addListener((group) => {
      this.#ownedGroups.delete(group.id);
      void this.#persistOwnedGroups();
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
      if (info.menuItemId === MENU_REEVALUATE && tab.windowId !== undefined) void this.reevaluateWindow(tab.windowId);
    });

    chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
      void this.#handleMessage(message).then(sendResponse);
      return true;
    });
  }

  async #handleMessage(message: unknown): Promise<unknown> {
    if (typeof message !== "object" || message === null || !("type" in message)) return { ok: false };
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
    this.#tabStates.set(tabId, reduceTabState(current, { type: "external-group", at: Date.now() }));
    await this.#persistTabStates();
  }

  async returnTabToAutomation(tabId: number): Promise<void> {
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
    const current = this.#tabStates.get(tabId) ?? initialTabState(tabId);
    if (current.state === "protected-external") return;

    if (isSplitViewTab(tab)) {
      this.#tabStates.set(tabId, reduceTabState(current, { type: "split-entered", at: Date.now() }));
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
        await this.protectTab(tabId);
        return;
      }
    }

    if (!tab.url || !/^https?:/i.test(tab.url)) {
      this.#tabStates.set(tabId, reduceTabState(current, { type: "rule-unmatched", at: Date.now() }));
      await this.#persistTabStates();
      return;
    }

    const rule = findMatchingRule(tab.url, settings.rules);
    if (!rule) {
      this.#tabStates.set(tabId, reduceTabState(current, { type: "rule-unmatched", at: Date.now() }));
      await this.#persistTabStates();
      return;
    }

    await this.#windowMutex.run(tab.windowId, async () => {
      if (await this.#windowHasSplitView(tab.windowId)) return;
      const group = await this.#getOrCreateOwnedGroup(tab.windowId, tabId, rule.id, rule.name, rule.color);
      if (tab.groupId !== group.groupId) {
        this.#mutations.begin(tabId, "group", 3000, group.groupId);
        await chrome.tabs.group({ tabIds: [tabId], groupId: group.groupId });
      }
      this.#tabStates.set(tabId, reduceTabState(current, { type: "rule-matched", ruleId: rule.id, at: Date.now() }));
      await this.#persistTabStates();
    });
  }

  async #getOrCreateOwnedGroup(
    windowId: number,
    tabId: number,
    ruleId: string,
    title: string,
    color: chrome.tabGroups.ColorEnum,
  ): Promise<OwnedGroup> {
    const existing = [...this.#ownedGroups.values()].find(
      (group) => group.windowId === windowId && group.ruleId === ruleId,
    );
    if (existing) {
      try {
        await chrome.tabGroups.get(existing.groupId);
        return existing;
      } catch {
        this.#ownedGroups.delete(existing.groupId);
      }
    }

    this.#mutations.begin(tabId, "group", 3000);
    const groupId = await chrome.tabs.group({ tabIds: [tabId], createProperties: { windowId } });
    await chrome.tabGroups.update(groupId, { title, color });
    const owned: OwnedGroup = { windowId, groupId, ruleId, createdAt: Date.now() };
    this.#ownedGroups.set(groupId, owned);
    await this.#persistOwnedGroups();
    return owned;
  }

  async #handleGroupChange(tabId: number, groupId: number): Promise<void> {
    const mutation = this.#mutations.consume(tabId, groupId === TAB_GROUP_ID_NONE ? "ungroup" : "group", groupId);
    if (mutation) return;
    if (groupId !== TAB_GROUP_ID_NONE && !this.#ownedGroups.has(groupId)) {
      await this.protectTab(tabId);
      return;
    }
    const state = this.#tabStates.get(tabId);
    if (state?.state === "protected-external") return;
    this.#scheduleEvaluation(tabId, 100);
  }

  async #handleSplitViewChange(tab: chrome.tabs.Tab, splitViewId: number): Promise<void> {
    if (tab.id === undefined || tab.windowId === undefined) return;
    const current = this.#tabStates.get(tab.id) ?? initialTabState(tab.id);
    if (splitViewId !== -1) {
      this.#tabStates.set(tab.id, reduceTabState(current, { type: "split-entered", at: Date.now() }));
      this.#tabScheduler.cancel(tab.id);
      await this.#persistTabStates();
      return;
    }
    this.#tabStates.set(tab.id, reduceTabState(current, { type: "split-left", at: Date.now() }));
    await this.#persistTabStates();
    this.#windowScheduler.schedule(
      tab.windowId,
      this.#settings?.splitViewSettleDelayMs ?? 500,
      () => this.reevaluateWindow(tab.windowId),
    );
  }

  async #windowHasSplitView(windowId: number): Promise<boolean> {
    const tabs = await chrome.tabs.query({ windowId });
    return tabs.some(isSplitViewTab);
  }

  async #reconcileStartup(): Promise<void> {
    const tabs = await chrome.tabs.query({});
    const liveIds = new Set(tabs.flatMap((tab) => (tab.id === undefined ? [] : [tab.id])));
    for (const tabId of this.#tabStates.keys()) if (!liveIds.has(tabId)) this.#tabStates.delete(tabId);

    for (const tab of tabs) {
      if (tab.id === undefined) continue;
      if (isSplitViewTab(tab)) {
        const current = this.#tabStates.get(tab.id) ?? initialTabState(tab.id);
        this.#tabStates.set(tab.id, reduceTabState(current, { type: "split-entered", at: Date.now() }));
      } else if (tab.groupId !== undefined && tab.groupId !== TAB_GROUP_ID_NONE && !this.#ownedGroups.has(tab.groupId)) {
        await this.protectTab(tab.id);
      } else {
        this.#scheduleEvaluation(tab.id, 200);
      }
    }
    await this.#persistTabStates();
  }

  async #reloadSettingsAndEvaluate(): Promise<void> {
    this.#settings = await this.#storage.getSettings();
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) if (tab.id !== undefined) this.#scheduleEvaluation(tab.id, 100);
  }

  async #installMenus(): Promise<void> {
    await chrome.contextMenus.removeAll();
    chrome.contextMenus.create({ id: MENU_RETURN, title: "Return this tab to AutoGrouping", contexts: ["page"] });
    chrome.contextMenus.create({ id: MENU_PROTECT, title: "Protect this tab from AutoGrouping", contexts: ["page"] });
    chrome.contextMenus.create({ id: MENU_REEVALUATE, title: "Re-evaluate this window", contexts: ["page"] });
  }

  async #persistTabStates(): Promise<void> {
    await this.#storage.setTabStates(this.#tabStates);
  }

  async #persistOwnedGroups(): Promise<void> {
    await this.#storage.setOwnedGroups(this.#ownedGroups);
  }
}
