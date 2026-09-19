import type { TabStateRecord } from "../core/types";
import {
  parsePopupMessage,
  type AcknowledgeResponse,
  type TabStatusResponse,
} from "../messaging/protocol";

/**
 * Popupから受信したメッセージを処理するためのコールバック群のインターフェース。
 */
export interface MessageHandlerActions {
  readonly getTabStatus: (tabId: number) => TabStateRecord;
  readonly returnTabToAutomation: (tabId: number) => Promise<void>;
  readonly protectTab: (tabId: number) => Promise<void>;
  readonly reevaluateWindow: (windowId: number) => Promise<void>;
}

/**
 * chrome.runtime.onMessage のメッセージを parsePopupMessage で検証し、適切なハンドラーへディスパッチするルーター。
 */
export class MessageRouter {
  readonly #actions: MessageHandlerActions;

  constructor(actions: MessageHandlerActions) {
    this.#actions = actions;
  }

  /**
   * 受信メッセージを解釈し、対応する処理を実行してレスポンスを返す。
   */
  async handleMessage(message: unknown): Promise<TabStatusResponse | AcknowledgeResponse> {
    const parsed = parsePopupMessage(message);
    if (!parsed) return { ok: false };

    switch (parsed.type) {
      case "get-status":
        return {
          ok: true,
          state: this.#actions.getTabStatus(parsed.tabId),
        };
      case "return-tab":
        await this.#actions.returnTabToAutomation(parsed.tabId);
        return { ok: true };
      case "protect-tab":
        await this.#actions.protectTab(parsed.tabId);
        return { ok: true };
      case "reevaluate-window":
        await this.#actions.reevaluateWindow(parsed.windowId);
        return { ok: true };
    }
  }
}
