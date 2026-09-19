/**
 * コンテキストメニュー項目のID定数。
 */
export const MENU_RETURN = "autogrouping:return";
export const MENU_PROTECT = "autogrouping:protect";
export const MENU_REEVALUATE = "autogrouping:reevaluate-window";

/**
 * コンテキストメニュー操作で呼び出すコールバック群のインターフェース。
 */
export interface ContextMenuActions {
  readonly returnTabToAutomation: (tabId: number) => Promise<void>;
  readonly protectTab: (tabId: number) => Promise<void>;
  readonly reevaluateWindow: (windowId: number) => Promise<void>;
}

/**
 * 右クリックコンテキストメニューの登録とクリックイベントのディスパッチを担当するマネージャー。
 */
export class ContextMenuManager {
  readonly #actions: ContextMenuActions;

  constructor(actions: ContextMenuActions) {
    this.#actions = actions;
  }

  /**
   * コンテキストメニュー項目を初期化・登録する。
   */
  async installMenus(): Promise<void> {
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

  /**
   * contextMenus.onClicked イベントを受け取り、適切なアクションへディスパッチする。
   */
  handleClick(info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab): void {
    if (tab?.id === undefined) return;
    if (info.menuItemId === MENU_RETURN) {
      void this.#actions.returnTabToAutomation(tab.id);
    } else if (info.menuItemId === MENU_PROTECT) {
      void this.#actions.protectTab(tab.id);
    } else if (info.menuItemId === MENU_REEVALUATE && tab.windowId !== undefined) {
      void this.#actions.reevaluateWindow(tab.windowId);
    }
  }
}
