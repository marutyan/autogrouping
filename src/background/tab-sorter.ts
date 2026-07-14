import { isSplitViewTab } from "../browser/chrome-types";
import { orderedOwnedGroupIds } from "../core/group-order";
import { KeyedMutex, KeyedScheduler } from "../core/scheduler";
import { ExtensionStorage } from "./storage";

const SORT_DELAY_MS = 120;

export class TabSorter {
  readonly #storage = new ExtensionStorage();
  readonly #scheduler = new KeyedScheduler<number>();
  readonly #mutex = new KeyedMutex<number>();

  async start(): Promise<void> {
    this.#registerListeners();
    await this.#scheduleAllWindows(0);
  }

  #registerListeners(): void {
    chrome.tabs.onCreated.addListener((tab) => this.#schedule(tab.windowId));

    chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
      if (
        changeInfo.url !== undefined ||
        changeInfo.groupId !== undefined ||
        changeInfo.pinned !== undefined ||
        changeInfo.status === "complete"
      ) {
        this.#schedule(tab.windowId);
      }
    });

    chrome.tabs.onMoved.addListener((_tabId, moveInfo) => this.#schedule(moveInfo.windowId));
    chrome.tabs.onAttached.addListener((_tabId, attachInfo) =>
      this.#schedule(attachInfo.newWindowId),
    );
    chrome.tabs.onRemoved.addListener((_tabId, removeInfo) => {
      if (!removeInfo.isWindowClosing) this.#schedule(removeInfo.windowId);
    });

    chrome.tabGroups.onCreated.addListener((group) => this.#schedule(group.windowId));
    chrome.tabGroups.onMoved.addListener((group) => this.#schedule(group.windowId));
    chrome.tabGroups.onRemoved.addListener((group) => this.#schedule(group.windowId));

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (
        (areaName === "sync" && changes.settings) ||
        (areaName === "session" && changes.ownedGroups)
      ) {
        void this.#scheduleAllWindows();
      }
    });
  }

  #schedule(windowId: number, delayMs = SORT_DELAY_MS): void {
    if (windowId < 0) return;
    this.#scheduler.schedule(windowId, delayMs, () => this.#sortWindow(windowId));
  }

  async #scheduleAllWindows(delayMs = SORT_DELAY_MS): Promise<void> {
    const tabs = await chrome.tabs.query({});
    const windowIds = new Set(tabs.map((tab) => tab.windowId));
    for (const windowId of windowIds) this.#schedule(windowId, delayMs);
  }

  async #sortWindow(windowId: number): Promise<void> {
    await this.#mutex.run(windowId, async () => {
      const settings = await this.#storage.getSettings();
      if (!settings.enabled) return;

      let tabs = await chrome.tabs.query({ windowId });
      if (tabs.length === 0 || tabs.some(isSplitViewTab)) return;

      const ownedGroups = await this.#storage.getOwnedGroups();
      const orderedGroupIds = orderedOwnedGroupIds(
        ownedGroups.values(),
        settings.rules,
        windowId,
      );
      if (orderedGroupIds.length === 0) return;

      let targetIndex = tabs.filter((tab) => tab.pinned).length;
      for (const groupId of orderedGroupIds) {
        tabs = await chrome.tabs.query({ windowId });
        const groupTabs = tabs
          .filter((tab) => tab.groupId === groupId && tab.id !== undefined)
          .sort((left, right) => left.index - right.index);
        const tabIds = groupTabs.flatMap((tab) => (tab.id === undefined ? [] : [tab.id]));
        if (tabIds.length === 0) continue;

        const currentIds = tabs
          .slice(targetIndex, targetIndex + tabIds.length)
          .flatMap((tab) => (tab.id === undefined ? [] : [tab.id]));
        const alreadyPlaced =
          currentIds.length === tabIds.length &&
          currentIds.every((tabId, index) => tabId === tabIds[index]);

        if (!alreadyPlaced) {
          try {
            await chrome.tabGroups.move(groupId, { index: targetIndex });
          } catch {
            // The group may disappear while URL or grouping events are settling.
          }
        }
        targetIndex += tabIds.length;
      }
    });
  }
}
