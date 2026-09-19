import type { TabStateRecord } from "../core/types";

// PopupとBackground(service worker)の間で chrome.runtime.sendMessage に載せるメッセージの型。
// 両側が同じ定義を参照することで、文字列の型名を二か所に書いて食い違うことを防ぐ。
export type PopupToBackgroundMessage =
  | { type: "get-status"; tabId: number }
  | { type: "return-tab"; tabId: number }
  | { type: "protect-tab"; tabId: number }
  | { type: "reevaluate-window"; windowId: number };

// get-status への応答。ok=false は未知のメッセージなど受け付けなかった場合。
export interface TabStatusResponse {
  ok: boolean;
  state?: TabStateRecord;
}

// 操作系メッセージ(return-tab / protect-tab / reevaluate-window)への応答。
export interface AcknowledgeResponse {
  ok: boolean;
}

// 受信した unknown 値が PopupToBackgroundMessage の形か判定する。
// Backgroundの受信側で最初に呼び、以降は型付きで扱うための入口。
export function parsePopupMessage(message: unknown): PopupToBackgroundMessage | undefined {
  if (typeof message !== "object" || message === null || !("type" in message)) return undefined;
  const candidate = message as { type?: unknown; tabId?: unknown; windowId?: unknown };
  switch (candidate.type) {
    case "get-status":
    case "return-tab":
    case "protect-tab":
      return typeof candidate.tabId === "number"
        ? { type: candidate.type, tabId: candidate.tabId }
        : undefined;
    case "reevaluate-window":
      return typeof candidate.windowId === "number"
        ? { type: "reevaluate-window", windowId: candidate.windowId }
        : undefined;
    default:
      return undefined;
  }
}
