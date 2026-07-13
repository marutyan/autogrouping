import { useEffect, useState } from "react";
import type { TabStateRecord } from "../../src/core/types";
import { loadSettings, saveSettings } from "../../src/ui/storage";

interface StatusResponse {
  ok: boolean;
  state?: TabStateRecord;
}

export function PopupApp() {
  const [enabled, setEnabled] = useState(true);
  const [tab, setTab] = useState<chrome.tabs.Tab>();
  const [state, setState] = useState<TabStateRecord>();

  useEffect(() => {
    void (async () => {
      const settings = await loadSettings();
      setEnabled(settings.enabled);
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      setTab(activeTab);
      if (activeTab?.id !== undefined) {
        const response = (await chrome.runtime.sendMessage({
          type: "get-status",
          tabId: activeTab.id,
        })) as StatusResponse;
        setState(response.state);
      }
    })();
  }, []);

  async function toggleEnabled() {
    const settings = await loadSettings();
    const next = !enabled;
    await saveSettings({ ...settings, enabled: next });
    setEnabled(next);
  }

  async function send(type: "return-tab" | "protect-tab" | "reevaluate-window") {
    if (!tab) return;
    await chrome.runtime.sendMessage({ type, tabId: tab.id, windowId: tab.windowId });
    if (tab.id !== undefined) {
      const response = (await chrome.runtime.sendMessage({
        type: "get-status",
        tabId: tab.id,
      })) as StatusResponse;
      setState(response.state);
    }
  }

  return (
    <main>
      <header>
        <div>
          <h1>AutoGrouping</h1>
          <p>Rule-based tab groups without taking control from you or browser agents.</p>
        </div>
        <button
          type="button"
          className={enabled ? "toggle active" : "toggle"}
          onClick={() => void toggleEnabled()}
        >
          {enabled ? "On" : "Off"}
        </button>
      </header>

      <section className="status">
        <span>Current tab</span>
        <strong>{formatState(state?.state)}</strong>
      </section>

      <div className="actions">
        <button type="button" onClick={() => void send("return-tab")}>
          Return to automation
        </button>
        <button type="button" onClick={() => void send("protect-tab")}>
          Protect this tab
        </button>
        <button type="button" onClick={() => void send("reevaluate-window")}>
          Re-evaluate window
        </button>
        <button type="button" onClick={() => void chrome.runtime.openOptionsPage()}>
          Open rules
        </button>
      </div>
    </main>
  );
}

function formatState(state: TabStateRecord["state"] | undefined): string {
  switch (state) {
    case "managed":
      return "Managed by AutoGrouping";
    case "protected-external":
      return "Protected from automation";
    case "protected-split-view":
      return "Protected by Split View";
    case "ignored-pinned":
      return "Pinned and ignored";
    case "unmatched":
      return "No matching rule";
    default:
      return "Waiting";
  }
}
