import { changedSplitViewId, isSplitViewTab } from "../browser/chrome-types";
import { MutationTracker } from "../core/mutation-tracker";
import { KeyedMutex, KeyedScheduler } from "../core/scheduler";
import { TAB_GROUP_ID_NONE, type ExtensionSettings } from "../core/types";
import { ContextMenuManager } from "./context-menus";
import { MessageRouter } from "./message-router";
import { OwnedGroupRegistry } from "./owned-group-registry";
import { ExtensionStorage } from "./storage";
import { TabEvaluator } from "./tab-evaluator";
import { TabStateStore } from "./tab-state-store";

/**
 * Background Service Worker の主制御コントローラー。
 * 起動シーケンスの進行、イベントリスナーの配線、および Split View 状態管理を担当する。
 */
export class AutoGroupingController {
  readonly #storage = new ExtensionStorage();
  readonly #mutations = new MutationTracker();
  readonly #tabScheduler = new KeyedScheduler<number>();
  readonly #groupChangeScheduler = new KeyedScheduler<number>();
  readonly #windowScheduler = new KeyedScheduler<number>();
  readonly #windowMutex = new KeyedMutex<number>();
  readonly #splitSettlingWindows = new Set<number>();
  #settings: ExtensionSettings | undefined;

  readonly #tabStates: TabStateStore;
  readonly #ownedGroups: OwnedGroupRegistry;
  readonly #evaluator: TabEvaluator;
  readonly #contextMenus: ContextMenuManager;
  readonly #messageRouter: MessageRouter;

  constructor() {
    this.#tabStates = new TabStateStore(this.#storage);
    this.#ownedGroups = new OwnedGroupRegistry(
      this.#storage,
      this.#mutations,
      this.#tabStates,
      (tabId, delayMs) => this.#scheduleEvaluation(tabId, delayMs),
    );
    this.#evaluator = new TabEvaluator(
      this.#tabStates,
      this.#ownedGroups,
      this.#mutations,
      this.#windowMutex,
      {
        getSettings: async () => this.#settings ?? (await this.#storage.getSettings()),
        isWindowSplitSettling: (id) => this.#splitSettlingWindows.has(id),
        windowHasSplitView: (id) => this.#windowHasSplitView(id),
        scheduleEvaluation: (id, ms) => this.#scheduleEvaluation(id, ms),
      },
    );
    const actions = {
      returnTabToAutomation: (id: number) => this.returnTabToAutomation(id),
      protectTab: (id: number) => this.protectTab(id),
      reevaluateWindow: (id: number) => this.reevaluateWindow(id),
    };
    this.#contextMenus = new ContextMenuManager(actions);
    this.#messageRouter = new MessageRouter({
      getTabStatus: (id) => this.#tabStates.get(id),
      ...actions,
    });
  }

  /** 起動処理。設定読込、メニュー、整合、起動時整理、リスナー登録の順で実行する。 */
  async start(): Promise<void> {
    this.#settings = await this.#storage.getSettings();
    await this.#tabStates.load();
    await this.#ownedGroups.load();
    await this.#contextMenus.installMenus();
    try {
      // 所有権整合と起動時の状態整理が終わるまでリスナーを登録しない。
      // 先に登録すると、整合処理の途中でイベントが発火し #evaluateTab が作った記録を
      // 整合処理の置き換えが消してしまう競合が起き得るため。
      await this.#ownedGroups.reconcileOwnership(this.#settings.rules);
      await this.#reconcileStartup();
    } finally {
      // 整合処理が例外を投げても拡張が完全に無反応にならないよう、リスナー登録は必ず行う。
      this.#registerListeners();
    }
  }

  /** 各種イベントリスナーを配線する。 */
  #registerListeners(): void {
    chrome.tabs.onCreated.addListener((tab) => {
      if (tab.id === undefined) return;
      void this.#tabStates.setInitial(tab.id);
      this.#scheduleEvaluation(tab.id, 0);
    });

    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      const splitViewId = changedSplitViewId(changeInfo);
      if (splitViewId !== undefined) return void this.#handleSplitViewChange(tab, splitViewId);
      if (changeInfo.groupId !== undefined)
        return this.#handleGroupChange(tabId, changeInfo.groupId);
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
      void this.#tabStates.remove(tabId);
    });

    chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
      void this.#tabStates.replace(addedTabId, removedTabId);
      this.#scheduleEvaluation(addedTabId, 0);
    });

    chrome.tabs.onAttached.addListener((tabId) => this.#scheduleEvaluation(tabId, 0));
    chrome.tabs.onDetached.addListener((tabId) => this.#tabScheduler.cancel(tabId));

    chrome.tabGroups.onRemoved.addListener((group) => {
      void this.#ownedGroups.handleGroupRemoved(group);
    });
    chrome.tabGroups.onUpdated.addListener(async (group) => {
      const settings = this.#settings ?? (await this.#storage.getSettings());
      await this.#ownedGroups.handleOwnedGroupMetadataChange(group, settings.rules);
    });
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === "sync" && changes.settings) void this.#reloadSettingsAndEvaluate();
    });
    chrome.contextMenus.onClicked.addListener((info, tab) => {
      this.#contextMenus.handleClick(info, tab);
    });
    chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
      void this.#messageRouter.handleMessage(message).then(sendResponse);
      return true;
    });
  }

  /** 指定タブを利用者明示の保護状態（protected-user）に変更する。 */
  async protectTab(tabId: number): Promise<void> {
    await this.#tabStates.apply(tabId, { type: "user-protect", at: Date.now() });
  }

  /** 指定タブの保護・外部所属を解除し、自動グルーピングの評価対象へ復帰させる。 */
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
    await this.#tabStates.apply(tabId, { type: "manual-reset", at: Date.now() });
    this.#scheduleEvaluation(tabId, 0);
  }

  /** 指定ウィンドウ内の全タブを再評価キューに投入する。 */
  async reevaluateWindow(windowId: number): Promise<void> {
    const tabs = await chrome.tabs.query({ windowId });
    for (const tab of tabs) if (tab.id !== undefined) this.#scheduleEvaluation(tab.id, 0);
  }

  /** タブ評価をスケジューラー経由で遅延実行する。 */
  #scheduleEvaluation(tabId: number, delayMs: number): void {
    this.#tabScheduler.schedule(tabId, delayMs, () => this.#evaluator.evaluateTab(tabId));
  }

  /** タブのグループ変更イベントを受け、自前変更の消費または予期しない変更の分類を行う。 */
  #handleGroupChange(tabId: number, groupId: number): void {
    const mutation = this.#mutations.consume(
      tabId,
      groupId === TAB_GROUP_ID_NONE ? "ungroup" : "group",
      groupId,
    );
    if (mutation) return;
    this.#groupChangeScheduler.schedule(tabId, 100, () =>
      this.#evaluator.classifyUnplannedGroupChange(tabId),
    );
  }

  /** Split View の出入りに伴うタブ状態遷移とウィンドウ再評価の遅延スケジュールを処理する。 */
  async #handleSplitViewChange(tab: chrome.tabs.Tab, splitViewId: number): Promise<void> {
    const windowId = tab.windowId;
    if (tab.id === undefined || windowId === undefined) return;
    if (splitViewId !== -1) {
      this.#splitSettlingWindows.add(windowId);
      await this.#tabStates.apply(tab.id, { type: "split-entered", at: Date.now() });
      this.#tabScheduler.cancel(tab.id);
      return;
    }
    await this.#tabStates.apply(tab.id, { type: "split-left", at: Date.now() });
    this.#windowScheduler.schedule(
      windowId,
      this.#settings?.splitViewSettleDelayMs ?? 500,
      async () => {
        this.#splitSettlingWindows.delete(windowId);
        await this.reevaluateWindow(windowId);
      },
    );
  }

  /** 指定ウィンドウ内に Split View 状態のタブが存在するか判定する。 */
  async #windowHasSplitView(windowId: number): Promise<boolean> {
    const tabs = await chrome.tabs.query({ windowId });
    return tabs.some(isSplitViewTab);
  }

  /** 起動時のタブ実態とタブ状態記録を突き合わせ、余分な記録の削除と初期評価のスケジュールを行う。 */
  async #reconcileStartup(): Promise<void> {
    const tabs = await chrome.tabs.query({});
    const liveIds = new Set(tabs.flatMap((tab) => (tab.id === undefined ? [] : [tab.id])));
    await this.#tabStates.prune(liveIds);

    for (const tab of tabs) {
      if (tab.id === undefined) continue;
      if (isSplitViewTab(tab)) {
        await this.#tabStates.apply(tab.id, { type: "split-entered", at: Date.now() });
      } else if (
        tab.groupId !== undefined &&
        tab.groupId !== TAB_GROUP_ID_NONE &&
        !this.#ownedGroups.has(tab.groupId)
      ) {
        await this.#tabStates.apply(tab.id, { type: "external-group", at: Date.now() });
      } else {
        if (this.#tabStates.get(tab.id).state === "protected-external") {
          await this.#tabStates.apply(tab.id, { type: "external-left", at: Date.now() });
        }
        this.#scheduleEvaluation(tab.id, 0);
      }
    }
  }

  /** 設定変更時に最新設定を読み直し、開いている全タブを再評価する。 */
  async #reloadSettingsAndEvaluate(): Promise<void> {
    this.#settings = await this.#storage.getSettings();
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) if (tab.id !== undefined) this.#scheduleEvaluation(tab.id, 0);
  }
}
