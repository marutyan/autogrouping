import type { ExtensionSettings, OwnedGroup, TabStateRecord } from "../core/types";
import { DEFAULT_SETTINGS } from "../core/types";
import { validateSettings } from "../core/rule-validation";

const SETTINGS_KEY = "settings";
const TAB_STATES_KEY = "tabStates";
const OWNED_GROUPS_KEY = "ownedGroups";
const KNOWN_OWNED_RULE_IDS_KEY = "knownOwnedRuleIds";

export class ExtensionStorage {
  #writeChain: Promise<void> = Promise.resolve();

  #enqueueWrite(write: () => Promise<void>): Promise<void> {
    const next = this.#writeChain.catch(() => undefined).then(write);
    this.#writeChain = next;
    return next;
  }
  async getSettings(): Promise<ExtensionSettings> {
    const data = await chrome.storage.sync.get(SETTINGS_KEY);
    const validation = validateSettings(data[SETTINGS_KEY] ?? DEFAULT_SETTINGS);
    return validation.value ?? DEFAULT_SETTINGS;
  }

  async setSettings(settings: ExtensionSettings): Promise<void> {
    await this.#enqueueWrite(() => chrome.storage.sync.set({ [SETTINGS_KEY]: settings }));
  }

  async getTabStates(): Promise<Map<number, TabStateRecord>> {
    const data = await chrome.storage.session.get(TAB_STATES_KEY);
    const entries = Array.isArray(data[TAB_STATES_KEY]) ? data[TAB_STATES_KEY] : [];
    return new Map(entries as [number, TabStateRecord][]);
  }

  async setTabStates(states: Map<number, TabStateRecord>): Promise<void> {
    const snapshot = [...states.entries()];
    await this.#enqueueWrite(() => chrome.storage.session.set({ [TAB_STATES_KEY]: snapshot }));
  }

  async getOwnedGroups(): Promise<Map<number, OwnedGroup>> {
    const data = await chrome.storage.session.get(OWNED_GROUPS_KEY);
    const entries = Array.isArray(data[OWNED_GROUPS_KEY]) ? data[OWNED_GROUPS_KEY] : [];
    return new Map(entries as [number, OwnedGroup][]);
  }

  async setOwnedGroups(groups: Map<number, OwnedGroup>): Promise<void> {
    const snapshot = [...groups.entries()];
    await this.#enqueueWrite(() => chrome.storage.session.set({ [OWNED_GROUPS_KEY]: snapshot }));
  }

  async getKnownOwnedRuleIds(): Promise<Set<string>> {
    const data = await chrome.storage.local.get(KNOWN_OWNED_RULE_IDS_KEY);
    const values = Array.isArray(data[KNOWN_OWNED_RULE_IDS_KEY])
      ? data[KNOWN_OWNED_RULE_IDS_KEY]
      : [];
    return new Set(values.filter((value): value is string => typeof value === "string"));
  }

  async addKnownOwnedRuleId(ruleId: string): Promise<void> {
    await this.#enqueueWrite(async () => {
      const data = await chrome.storage.local.get(KNOWN_OWNED_RULE_IDS_KEY);
      const values = Array.isArray(data[KNOWN_OWNED_RULE_IDS_KEY])
        ? data[KNOWN_OWNED_RULE_IDS_KEY]
        : [];
      const known = new Set(values.filter((value): value is string => typeof value === "string"));
      known.add(ruleId);
      await chrome.storage.local.set({ [KNOWN_OWNED_RULE_IDS_KEY]: [...known].sort() });
    });
  }
}
