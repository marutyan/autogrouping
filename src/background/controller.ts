import { changedSplitViewId, isSplitViewTab } from "../browser/chrome-types";
import {
  findAdoptableGroupIds,
  reconcileOwnedGroups,
  type GroupSnapshot,
} from "../core/group-ownership";
import { MutationTracker } from "../core/mutation-tracker";
import { findMatchingRule } from "../core/rule-matcher";
import { KeyedMutex, KeyedScheduler } from "../core/scheduler";
import { initialTabState, reduceTabState } from "../core/state-machine";
import {
  TAB_GROUP_ID_NONE,
  type ExtensionSettings,
  type GroupingRule,
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
    try {
      // 所有権整合と起動時の状態整理が終わるまでリスナーを登録しない。
      // 先に登録すると、整合処理の途中でイベントが発火し #evaluateTab が作った記録を
      // 整合処理の置き換えが消してしまう競合が起き得るため。
      await this.#reconcileOwnership();
      await this.#reconcileStartup();
    } finally {
      // 整合処理が例外を投げても拡張が完全に無反応にならないよう、リスナー登録は必ず行う。
      this.#registerListeners();
    }
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
      void this.#handleGroupRemoved(group);
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
      const result = await this.#getOrCreateOwnedGroup(tab.windowId, tabId, rule);
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
    rule: GroupingRule,
  ): Promise<{ group: OwnedGroup; createdWithTab: boolean }> {
    // 同一 (windowId, ruleId) の所有グループが複数残っていても壊さず全部保持する方針のため、
    // 代表選出は groupId 昇順で決定的に行う。先頭の記録が既に別ウィンドウへ移動済み、または
    // グループごと消滅していた場合はその記録だけ更新／削除して次の候補へ進む。ここで止まると、
    // 同ウィンドウに残っている有効な記録を見落として重複グループを新規作成してしまう。
    const candidates = [...this.#ownedGroups.values()]
      .filter((group) => group.windowId === windowId && group.ruleId === rule.id)
      .sort((a, b) => a.groupId - b.groupId);
    for (const candidate of candidates) {
      try {
        const browserGroup = await chrome.tabGroups.get(candidate.groupId);
        if (browserGroup.windowId !== candidate.windowId) {
          // グループが別ウィンドウへ移動済み。所有記録のwindowIdだけ実際の値へ追随させ、
          // 今回のタブには使わず次の候補へ進む。ここで採用すると chrome.tabs.group が
          // 別ウィンドウのタブをこのウィンドウのグループへ吸い込んでしまう。
          this.#ownedGroups.set(candidate.groupId, {
            ...candidate,
            windowId: browserGroup.windowId,
          });
          await this.#persistOwnedGroups();
          continue;
        }
        if (browserGroup.title !== rule.name || browserGroup.color !== rule.color) {
          await chrome.tabGroups.update(candidate.groupId, {
            title: rule.name,
            color: rule.color,
          });
        }
        return { group: candidate, createdWithTab: false };
      } catch {
        this.#ownedGroups.delete(candidate.groupId);
      }
    }

    // 新規作成の前に、同ウィンドウに未所有だが引き取り可能な既存グループが無いか確認する。
    // 所有権を失った後の再評価で同名グループが重複して作られる不具合の根本対策。
    const adoptedGroupId = await this.#findAdoptableGroupInWindow(windowId, rule);
    if (adoptedGroupId !== undefined) {
      const owned: OwnedGroup = {
        windowId,
        groupId: adoptedGroupId,
        ruleId: rule.id,
        createdAt: Date.now(),
      };
      this.#ownedGroups.set(adoptedGroupId, owned);
      await this.#persistOwnedGroups();
      // 引き取ったグループの他のタブは protected-external のまま残っている。通常評価へ戻すことで、
      // 一致しないタブは外れ、同名グループが複数残っていれば一致タブが代表グループへ寄っていく。
      const tabsInGroup = await chrome.tabs.query({ windowId, groupId: adoptedGroupId });
      for (const groupedTab of tabsInGroup) {
        if (groupedTab.id !== undefined) this.#scheduleEvaluation(groupedTab.id, 0);
      }
      return { group: owned, createdWithTab: false };
    }

    this.#mutations.begin(tabId, "group", 3000);
    const groupId = await chrome.tabs.group({ tabIds: [tabId], createProperties: { windowId } });
    await chrome.tabGroups.update(groupId, { title: rule.name, color: rule.color });
    const owned: OwnedGroup = { windowId, groupId, ruleId: rule.id, createdAt: Date.now() };
    this.#ownedGroups.set(groupId, owned);
    await this.#storage.addKnownOwnedRuleId(rule.id);
    await this.#persistOwnedGroups();
    return { group: owned, createdWithTab: true };
  }

  // 指定ウィンドウのグループ観測結果を作り、その中に rule が安全に引き取れる未所有グループが
  // あるかを findAdoptableGroupIds（reconcileOwnedGroupsと共通の判定源）で確認する。
  // 複数候補があり得るが、この呼び出し元は1グループあれば足りるので先頭（groupId最小）を使う。
  async #findAdoptableGroupInWindow(
    windowId: number,
    rule: GroupingRule,
  ): Promise<number | undefined> {
    const groups = await this.#buildGroupSnapshots({ windowId });
    const knownOwnedRuleIds = await this.#storage.getKnownOwnedRuleIds();
    return findAdoptableGroupIds({
      groups,
      rule,
      windowId,
      knownOwnedRuleIds,
      ownedGroupIds: new Set(this.#ownedGroups.keys()),
    })[0];
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

  async #handleGroupRemoved(group: chrome.tabGroups.TabGroup): Promise<void> {
    const ownedChanged = this.#ownedGroups.delete(group.id);
    if (ownedChanged) await this.#persistOwnedGroups();

    const tabs = await chrome.tabs.query({ windowId: group.windowId });
    let stateChanged = false;
    for (const tab of tabs) {
      if (tab.id === undefined) continue;
      const current = this.#tabStates.get(tab.id);
      if (current?.state !== "protected-external") continue;
      if (
        tab.groupId !== undefined &&
        tab.groupId !== TAB_GROUP_ID_NONE &&
        !this.#ownedGroups.has(tab.groupId)
      ) {
        continue;
      }

      this.#tabStates.set(
        tab.id,
        reduceTabState(current, { type: "external-left", at: Date.now() }),
      );
      this.#scheduleEvaluation(tab.id, 0);
      stateChanged = true;
    }
    if (stateChanged) await this.#persistTabStates();
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

  // chrome.tabGroups/tabs から純関数へ渡せる GroupSnapshot[] を組み立てる。
  // 起動時の所有権整合(#reconcileOwnership)と、新規作成前の引き取り確認(#findAdoptableGroupInWindow)の
  // 両方が使う共通の観測ロジック。
  async #buildGroupSnapshots(query: chrome.tabGroups.QueryInfo = {}): Promise<GroupSnapshot[]> {
    const groups = await chrome.tabGroups.query(query);
    const snapshots: GroupSnapshot[] = [];
    for (const group of groups) {
      const tabs = await chrome.tabs.query({ windowId: group.windowId, groupId: group.id });
      snapshots.push({
        groupId: group.id,
        windowId: group.windowId,
        title: group.title,
        color: group.color,
        tabs: tabs.map((tab) => ({
          // exactOptionalPropertyTypes下ではid/urlがundefinedのプロパティを持てないため、値がある時だけ含める。
          ...(tab.id === undefined ? {} : { id: tab.id }),
          ...(tab.url === undefined ? {} : { url: tab.url }),
          splitView: isSplitViewTab(tab),
        })),
      });
    }
    return snapshots;
  }

  // 永続化済みの所有記録(storage.session)を正として現在のグループ状態へ整合させる。
  // 推定で毎回作り直す(#ownedGroups.clear() してからルール一致で組み立て直す)設計はここで廃止し、
  // 実在しなくなった記録の削除、windowIdの追随、安全な条件を満たす未所有グループの引き取りだけを行う。
  // 同一(windowId, ruleId)の所有グループが複数残っても、ここで壊す（消す）処理はしない。
  // グループを消す操作は安全境界の外側なので作らず、通常のURL評価が一致タブを代表グループへ
  // 寄せることで自然に1つへ収束させる。
  async #reconcileOwnership(): Promise<void> {
    const settings = this.#settings ?? (await this.#storage.getSettings());
    const knownOwnedRuleIds = await this.#storage.getKnownOwnedRuleIds();
    const groups = await this.#buildGroupSnapshots({});

    const owned = reconcileOwnedGroups({
      previous: this.#ownedGroups,
      groups,
      rules: settings.rules,
      knownOwnedRuleIds,
      now: Date.now(),
    });

    this.#ownedGroups.clear();
    for (const [groupId, record] of owned) this.#ownedGroups.set(groupId, record);
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
