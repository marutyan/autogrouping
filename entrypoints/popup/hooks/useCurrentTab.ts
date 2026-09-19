import { useEffect, useState } from "react";
import type { TabStateRecord } from "../../../src/core/types";
import { fetchTabState } from "../../../src/ui/background-client";

// 現在のアクティブタブの情報と管理状態を取得し、500ms間隔の定期ポーリングで最新化するhook。
// タブのURL変更やバックグラウンドによる自動化・保護状態の推移をリアルタイムにUIへ反映する。
export function useCurrentTab() {
  const [tab, setTab] = useState<chrome.tabs.Tab>();
  const [state, setState] = useState<TabStateRecord>();

  useEffect(() => {
    void (async () => {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      setTab(activeTab);
    })();
  }, []);

  useEffect(() => {
    const tabId = tab?.id;
    if (tabId === undefined) return;

    let cancelled = false;
    const update = async () => {
      const [nextState, currentTab] = await Promise.all([
        fetchTabState(tabId),
        chrome.tabs.get(tabId).catch(() => undefined),
      ]);
      if (cancelled) return;
      setState(nextState);
      if (currentTab) setTab(currentTab);
    };

    void update();
    const intervalId = window.setInterval(() => void update(), 500);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [tab?.id]);

  async function refreshTabState(): Promise<void> {
    if (tab?.id !== undefined) {
      setState(await fetchTabState(tab.id));
    }
  }

  return {
    tab,
    state,
    setTab,
    setState,
    refreshTabState,
  };
}
