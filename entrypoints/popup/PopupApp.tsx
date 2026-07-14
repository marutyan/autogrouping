import { useEffect, useState, type ChangeEvent } from "react";
import type { GroupingRule, TabStateRecord } from "../../src/core/types";
import { validateSettings } from "../../src/core/rule-validation";
import { GROUP_COLORS, GROUP_COLOR_HEX } from "../../src/ui/group-colors";
import { loadSettings, saveSettings } from "../../src/ui/storage";

interface StatusResponse {
  ok: boolean;
  state?: TabStateRecord;
}

export function PopupApp() {
  const [enabled, setEnabled] = useState(true);
  const [rules, setRules] = useState<GroupingRule[]>([]);
  const [tab, setTab] = useState<chrome.tabs.Tab>();
  const [state, setState] = useState<TabStateRecord>();
  const [draft, setDraft] = useState<GroupingRule>();
  const [message, setMessage] = useState("");

  useEffect(() => {
    void (async () => {
      const settings = await loadSettings();
      setEnabled(settings.enabled);
      setRules(settings.rules);
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

  function beginAddRule() {
    setMessage("");
    setDraft({
      id: crypto.randomUUID(),
      name: "New group",
      color: "blue",
      patterns: [defaultPattern(tab)],
      priority: rules.length,
      enabled: true,
      createdAt: Date.now(),
    });
  }

  function beginEditRule(rule: GroupingRule) {
    setMessage("");
    setDraft({ ...rule, patterns: [...rule.patterns] });
  }

  async function persistDraft() {
    if (!draft) return;
    const settings = await loadSettings();
    const exists = rules.some((rule) => rule.id === draft.id);
    const nextRules = (exists
      ? rules.map((rule) => (rule.id === draft.id ? draft : rule))
      : [...rules, draft]
    ).map((rule, index) => ({ ...rule, priority: index }));
    const validation = validateSettings({ ...settings, rules: nextRules });
    if (!validation.value || validation.errors.length > 0) {
      setMessage(validation.errors.join(" ") || "Rule is invalid.");
      return;
    }
    await saveSettings(validation.value);
    setRules(validation.value.rules);
    setDraft(undefined);
    setMessage("Saved.");
    if (tab?.windowId !== undefined) {
      await chrome.runtime.sendMessage({ type: "reevaluate-window", windowId: tab.windowId });
    }
  }

  async function deleteDraft() {
    if (!draft) return;
    const settings = await loadSettings();
    const nextRules = rules
      .filter((rule) => rule.id !== draft.id)
      .map((rule, index) => ({ ...rule, priority: index }));
    await saveSettings({ ...settings, rules: nextRules });
    setRules(nextRules);
    setDraft(undefined);
    setMessage("Deleted.");
  }

  return (
    <main>
      <header>
        <div>
          <h1>AutoGrouping</h1>
          <p>Choose a group or add one without leaving this popup.</p>
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

      <section className="groups-section">
        <div className="section-heading">
          <div>
            <h2>Groups</h2>
            <span>{rules.length}</span>
          </div>
          <button type="button" className="add-button" onClick={beginAddRule}>
            + Add
          </button>
        </div>

        <div className="rule-list">
          {rules.length === 0 && (
            <button type="button" className="empty-rule" onClick={beginAddRule}>
              No groups yet. Add your first group.
            </button>
          )}
          {rules.map((rule) => (
            <button
              type="button"
              className="rule-row"
              key={rule.id}
              onClick={() => beginEditRule(rule)}
            >
              <span
                className="rule-color"
                style={{ backgroundColor: GROUP_COLOR_HEX[rule.color] }}
                aria-hidden="true"
              />
              <span className="rule-copy">
                <strong>{rule.name}</strong>
                <small>{rule.patterns.join(", ")}</small>
              </span>
              <span className={rule.enabled ? "rule-state enabled" : "rule-state"}>
                {rule.enabled ? "On" : "Off"}
              </span>
            </button>
          ))}
        </div>
      </section>

      {draft && (
        <section className="editor">
          <div className="editor-heading">
            <h2>
              {rules.some((rule) => rule.id === draft.id) ? "Edit group" : "Add group"}
            </h2>
            <button
              type="button"
              className="icon-button"
              onClick={() => setDraft(undefined)}
            >
              ×
            </button>
          </div>

          <label>
            <span>Name</span>
            <input
              value={draft.name}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setDraft({ ...draft, name: event.target.value })
              }
            />
          </label>

          <label>
            <span>URL patterns</span>
            <textarea
              rows={3}
              value={draft.patterns.join("\n")}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                setDraft({
                  ...draft,
                  patterns: event.target.value
                    .split("\n")
                    .map((value) => value.trim())
                    .filter(Boolean),
                })
              }
            />
          </label>

          <fieldset>
            <legend>Color</legend>
            <div className="color-picker">
              {GROUP_COLORS.map((color) => (
                <button
                  type="button"
                  key={color}
                  className={
                    draft.color === color ? "color-swatch selected" : "color-swatch"
                  }
                  style={{ backgroundColor: GROUP_COLOR_HEX[color] }}
                  aria-label={color}
                  aria-pressed={draft.color === color}
                  onClick={() => setDraft({ ...draft, color })}
                />
              ))}
            </div>
          </fieldset>

          <label className="enabled-control">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setDraft({ ...draft, enabled: event.target.checked })
              }
            />
            Enabled
          </label>

          <div className="editor-actions">
            {rules.some((rule) => rule.id === draft.id) && (
              <button type="button" className="danger" onClick={() => void deleteDraft()}>
                Delete
              </button>
            )}
            <button type="button" onClick={() => setDraft(undefined)}>
              Cancel
            </button>
            <button type="button" className="primary" onClick={() => void persistDraft()}>
              Save
            </button>
          </div>
        </section>
      )}

      {message && <p className="message">{message}</p>}

      <details className="tab-actions">
        <summary>Current tab actions</summary>
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
        </div>
      </details>

      <button
        type="button"
        className="advanced"
        onClick={() => void chrome.runtime.openOptionsPage()}
      >
        Advanced settings
      </button>
    </main>
  );
}

function defaultPattern(tab: chrome.tabs.Tab | undefined): string {
  if (!tab?.url) return "example.com/*";
  try {
    const url = new URL(tab.url);
    return /^https?:$/.test(url.protocol) ? `${url.hostname}/*` : "example.com/*";
  } catch {
    return "example.com/*";
  }
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
