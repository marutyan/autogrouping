import type { ExtensionSettings } from "../core/types";
import { DEFAULT_SETTINGS } from "../core/types";
import { validateSettings } from "../core/rule-validation";

export async function loadSettings(): Promise<ExtensionSettings> {
  const data = await chrome.storage.sync.get("settings");
  const result = validateSettings(data.settings ?? DEFAULT_SETTINGS);
  return result.value ?? DEFAULT_SETTINGS;
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  await chrome.storage.sync.set({ settings });
}
