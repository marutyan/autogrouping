import { validateSettings } from "../core/rule-validation";
import { DEFAULT_SETTINGS, type ExtensionSettings } from "../core/types";

// Chromeの同期ストレージから拡張機能設定を読み込み、バリデーションした設定値を返す。
// 不正または未保存の設定値がある場合に既定値へ安全にフォールバックするために利用する。
export async function loadSettings(): Promise<ExtensionSettings> {
  const data = await chrome.storage.sync.get("settings");
  const result = validateSettings(data.settings ?? DEFAULT_SETTINGS);
  return result.value ?? DEFAULT_SETTINGS;
}

// 拡張機能設定をChromeの同期ストレージへ永続化保存する。
// 利用者が変更したルールや自動化の有効状態を端末間で同期するために利用する。
export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  await chrome.storage.sync.set({ settings });
}
