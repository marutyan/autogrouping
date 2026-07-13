export interface SplitViewAwareTab extends chrome.tabs.Tab {
  splitViewId?: number;
}

export function isSplitViewTab(tab: chrome.tabs.Tab): boolean {
  const splitViewId = (tab as SplitViewAwareTab).splitViewId;
  return typeof splitViewId === "number" && splitViewId !== -1;
}

export function changedSplitViewId(changeInfo: chrome.tabs.TabChangeInfo): number | undefined {
  const value = (changeInfo as chrome.tabs.TabChangeInfo & { splitViewId?: number }).splitViewId;
  return typeof value === "number" ? value : undefined;
}
