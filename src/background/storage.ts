import type { ExtensionSettings, OwnedGroup, TabStateRecord } from "../core/types";
import { DEFAULT_SETTINGS } from "../core/types";
import { validateSettings } from "../core/rule-validation";

const SETTINGS_KEY = "settings";
const TAB_STATES_KEY = "tabStates";
const OWNED_GROUPS_KEY = "ownedGroups";

export class ExtensionStorage {
  async getSettings(): Promise<ExtensionSettings> {
    const data = await chrome.storage.sync.get(SETTINGS_KEY);
    const validation = validateSettings(data[SETTINGS_KEY] ?? DEFAULT_SETTINGS);
    return validation.value ?? DEFAULT_SETTINGS;
  }

  async setSettings(settings: ExtensionSettings): Promise<void> {
    await chrome.storage.sync.set({ [SETTINGS_KEY]: settings });
  }

  async getTabStates(): Promise<Map<number, TabStateRecord>> {
    const data = await chrome.storage.session.get(TAB_STATES_KEY);
    const entries = Array.isArray(data[TAB_STATES_KEY]) ? data[TAB_STATES_KEY] : [];
    return new Map(entries as [number, TabStateRecord][]);
  }

  async setTabStates(states: Map<number, TabStateRecord>): Promise<void> {
    await chrome.storage.session.set({ [TAB_STATES_KEY]: [...states.entries()] });
  }

  async getOwnedGroups(): Promise<Map<number, OwnedGroup>> {
    const data = await chrome.storage.session.get(OWNED_GROUPS_KEY);
    const entries = Array.isArray(data[OWNED_GROUPS_KEY]) ? data[OWNED_GROUPS_KEY] : [];
    return new Map(entries as [number, OwnedGroup][]);
  }

  async setOwnedGroups(groups: Map<number, OwnedGroup>): Promise<void> {
    await chrome.storage.session.set({ [OWNED_GROUPS_KEY]: [...groups.entries()] });
  }
}
