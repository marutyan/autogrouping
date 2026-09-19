import { useEffect, useRef, useState } from "react";
import type { TabStateRecord } from "../../../src/core/types";
import { fetchTabState } from "../../../src/ui/background-client";

// 現在のアクティブタブを取得する内部ヘルパー。
// テスト時や開発時にPopup自身がタブとして開かれた場合、同ウィンドウまたは全タブ内のWebタブがあればそれを優先する。
async function resolveCurrentTab(): Promise<chrome.tabs.Tab | undefined> {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (activeTab?.url?.startsWith("chrome-extension://")) {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const webTab = tabs.find(
      (candidate) => candidate.url?.startsWith("http://") || candidate.url?.startsWith("https://"),
    );
    if (webTab) return webTab;

    const allTabs = await chrome.tabs.query({});
    const webTabAnywhere = allTabs.find(
      (candidate) => candidate.url?.startsWith("http://") || candidate.url?.startsWith("https://"),
    );
    if (webTabAnywhere) return webTabAnywhere;
  }
  return activeTab;
}

// 現在のアクティブタブの情報と管理状態を取得し、500ms間隔の定期ポーリングで最新化するhook。
// タブのURL変更やバックグラウンドによる自動化・保護状態の推移をリアルタイムにUIへ反映する。
export function useCurrentTab() {
  const [tab, setTab] = useState<chrome.tabs.Tab>();
  const [state, setState] = useState<TabStateRecord>();
  const tabRef = useRef<chrome.tabs.Tab | undefined>(tab);

  useEffect(() => {
    tabRef.current = tab;
  }, [tab]);

  useEffect(() => {
    void (async () => {
      const activeTab = await resolveCurrentTab();
      setTab(activeTab);
    })();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const update = async () => {
      let currentResolved = tabRef.current;
      if (!currentResolved || currentResolved.url?.startsWith("chrome-extension://")) {
        const resolved = await resolveCurrentTab();
        if (resolved && resolved.id !== currentResolved?.id) {
          currentResolved = resolved;
          if (!cancelled) setTab(resolved);
        }
      }

      const tabId = currentResolved?.id;
      if (tabId === undefined) return;

      const [nextState, refreshedTab] = await Promise.all([
        fetchTabState(tabId),
        chrome.tabs.get(tabId).catch(() => undefined),
      ]);
      if (cancelled) return;
      setState(nextState);
      if (refreshedTab) setTab(refreshedTab);
    };

    void update();
    const intervalId = window.setInterval(() => void update(), 500);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  async function refreshTabState(): Promise<void> {
    const tabId = tabRef.current?.id;
    if (tabId !== undefined) {
      setState(await fetchTabState(tabId));
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
