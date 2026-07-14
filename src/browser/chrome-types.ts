export interface SplitViewAwareTab extends chrome.tabs.Tab {
  splitViewId?: number;
}

export function isSplitViewTab(tab: chrome.tabs.Tab): boolean {
  const splitViewId = (tab as SplitViewAwareTab).splitViewId;
  return typeof splitViewId === "number" && splitViewId !== -1;
}

export function changedSplitViewId(changeInfo: unknown): number | undefined {
  if (typeof changeInfo !== "object" || changeInfo === null || !("splitViewId" in changeInfo)) {
    return undefined;
  }

  const value = (changeInfo as { splitViewId?: unknown }).splitViewId;
  return typeof value === "number" ? value : undefined;
}
