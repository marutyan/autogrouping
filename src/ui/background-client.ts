import type { TabStateRecord } from "../core/types";
import type {
  AcknowledgeResponse,
  PopupToBackgroundMessage,
  TabStatusResponse,
} from "../messaging/protocol";

// service workerへメッセージを安全に送信し、未起動や切断時はundefinedを返す内部ヘルパー。
// バックグラウンド再起動中などの通信失敗でPopupがクラッシュすることを防ぐ。
async function safeSendMessage<T = unknown>(
  message: PopupToBackgroundMessage,
): Promise<T | undefined> {
  try {
    return (await chrome.runtime.sendMessage(message)) as T;
  } catch {
    return undefined;
  }
}

// バックグラウンドから指定タブの管理状態レコードを取得する。
// 現在のタブが自動グループ化されているか、保護されているか等の最新状態を取得するために使う。
export async function fetchTabState(tabId: number): Promise<TabStateRecord | undefined> {
  const response = await safeSendMessage<TabStatusResponse>({ type: "get-status", tabId });
  return response?.state;
}

// 指定タブを手動保護または除外から自動グルーピング対象へ戻すようBackgroundへ要求する。
// Popupからタブの自動化復帰を指示し、結果が届かなかった場合は再起動中とみなす。
export async function returnTab(tabId: number): Promise<AcknowledgeResponse | undefined> {
  return await safeSendMessage<AcknowledgeResponse>({ type: "return-tab", tabId });
}

// 指定タブを自動グルーピングの対象から手動保護するようBackgroundへ要求する。
// 利用者がタブを意図的にグループから外した状態を維持するために使う。
export async function protectTab(tabId: number): Promise<AcknowledgeResponse | undefined> {
  return await safeSendMessage<AcknowledgeResponse>({ type: "protect-tab", tabId });
}

// 指定ウィンドウ内のすべてのタブについてグループ状態を再評価するようBackgroundへ要求する。
// ルール保存や手動再評価時にウィンドウ全体へ即座に設定を反映させるために使う。
export async function reevaluateWindow(windowId: number): Promise<AcknowledgeResponse | undefined> {
  return await safeSendMessage<AcknowledgeResponse>({ type: "reevaluate-window", windowId });
}
