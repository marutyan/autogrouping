import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import { findRuleConflicts } from "../../src/core/rule-conflicts";
import { findMatchingRuleDetail } from "../../src/core/rule-matcher";
import { validateSettings } from "../../src/core/rule-validation";
import type { GroupColor, GroupingRule, TabStateRecord } from "../../src/core/types";
import { GROUP_COLORS, GROUP_COLOR_HEX } from "../../src/ui/group-colors";
import { loadSettings, saveSettings } from "../../src/ui/storage";

interface StatusResponse {
  ok: boolean;
  state?: TabStateRecord;
}

interface UndoAction {
  label: string;
  previousRules: GroupingRule[];
}

interface DropTarget {
  ruleId: string;
  position: "before" | "after";
}

type SiteScope = "site" | "path" | "page";

export function PopupApp() {
  const [enabled, setEnabled] = useState(true);
  const [rules, setRules] = useState<GroupingRule[]>([]);
  const [tab, setTab] = useState<chrome.tabs.Tab>();
  const [state, setState] = useState<TabStateRecord>();
  const [draft, setDraft] = useState<GroupingRule>();
  const [targetInput, setTargetInput] = useState("");
  const [targetScope, setTargetScope] = useState<SiteScope>("site");
  const [editingPattern, setEditingPattern] = useState<string>();
  const [message, setMessage] = useState("");
  const [undoAction, setUndoAction] = useState<UndoAction>();
  const [colorMenuRuleId, setColorMenuRuleId] = useState<string>();
  const [draggedRuleId, setDraggedRuleId] = useState<string>();
  const [dropTarget, setDropTarget] = useState<DropTarget>();

  useEffect(() => {
    void (async () => {
      const settings = await loadSettings();
      setEnabled(settings.enabled);
      setRules(settings.rules);
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

  useEffect(() => {
    if (!message) return;
    const delay = undoAction
      ? 6000
      : message === "Saved." || message === "Color updated."
        ? 1800
        : 4000;
    const timeoutId = window.setTimeout(() => {
      setMessage("");
      setUndoAction(undefined);
    }, delay);
    return () => window.clearTimeout(timeoutId);
  }, [message, undoAction]);

  useEffect(() => {
    if (!colorMenuRuleId) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".color-cell")) return;
      setColorMenuRuleId(undefined);
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setColorMenuRuleId(undefined);
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [colorMenuRuleId]);

  const conflicts = useMemo(() => findRuleConflicts(rules), [rules]);
  const conflictNamesByRule = useMemo(() => {
    const names = new Map<string, Set<string>>();
    const ruleById = new Map(rules.map((rule) => [rule.id, rule]));
    for (const conflict of conflicts) {
      const firstName = ruleById.get(conflict.firstRuleId)?.name;
      const secondName = ruleById.get(conflict.secondRuleId)?.name;
      if (firstName && secondName) {
        addMapValue(names, conflict.firstRuleId, secondName);
        addMapValue(names, conflict.secondRuleId, firstName);
      }
    }
    return names;
  }, [conflicts, rules]);

  const draftConflictNames = useMemo(() => {
    if (!draft) return [];
    const candidateRules = normalizePriorities(
      rules.some((rule) => rule.id === draft.id)
        ? rules.map((rule) => (rule.id === draft.id ? draft : rule))
        : [...rules, draft],
    );
    const names = new Set<string>();
    const ruleById = new Map(candidateRules.map((rule) => [rule.id, rule]));
    for (const conflict of findRuleConflicts(candidateRules)) {
      if (conflict.firstRuleId === draft.id) {
        const name = ruleById.get(conflict.secondRuleId)?.name;
        if (name) names.add(name);
      }
      if (conflict.secondRuleId === draft.id) {
        const name = ruleById.get(conflict.firstRuleId)?.name;
        if (name) names.add(name);
      }
    }
    return [...names];
  }, [draft, rules]);

  const tabStatus = useMemo(() => describeTabStatus(state, tab, rules), [state, tab, rules]);

  async function toggleEnabled() {
    const settings = await loadSettings();
    const next = !enabled;
    await saveSettings({ ...settings, enabled: next });
    setEnabled(next);
    showMessage(next ? "Automatic grouping resumed." : "Automatic grouping paused.");
  }

  async function send(type: "return-tab" | "protect-tab" | "reevaluate-window") {
    if (!tab) return;
    const response = await safeSendMessage({
      type,
      tabId: tab.id,
      windowId: tab.windowId,
    });
    if (response === undefined) {
      showMessage("Background service is restarting. Reopen the popup and try again.");
      return;
    }
    if (tab.id !== undefined) setState(await fetchTabState(tab.id));
  }

  function showMessage(nextMessage: string, nextUndo?: UndoAction) {
    setMessage(nextMessage);
    setUndoAction(nextUndo);
  }

  function resetTargetEditor() {
    setTargetInput("");
    setTargetScope("site");
    setEditingPattern(undefined);
  }

  function beginAddRule() {
    showMessage("");
    resetTargetEditor();
    setDraft({
      id: crypto.randomUUID(),
      name: "",
      color: "blue",
      patterns: [],
      priority: rules.length,
      enabled: true,
      createdAt: Date.now(),
    });
  }

  function beginEditRule(rule: GroupingRule) {
    showMessage("");
    resetTargetEditor();
    setDraft({ ...rule, patterns: [...rule.patterns] });
  }

  function beginEditTarget(rule: GroupingRule, pattern: string) {
    showMessage("");
    setDraft({ ...rule, patterns: [...rule.patterns] });
    startEditingTarget(pattern);
  }

  function startEditingTarget(pattern: string) {
    if (!isSimplePattern(pattern)) {
      setEditingPattern(undefined);
      setTargetInput("");
      setTargetScope("site");
      showMessage("This custom wildcard can be edited under Advanced matching patterns.");
      return;
    }
    const scope = inferScope(pattern);
    setEditingPattern(pattern);
    setTargetInput(patternToInput(pattern, scope));
    setTargetScope(scope);
    showMessage("");
  }

  function saveTarget(value = targetInput, scope = targetScope, replacedPattern = editingPattern) {
    if (!draft) return;
    const pattern = patternFromInput(value, scope);
    if (!pattern) {
      showMessage("Enter a valid URL, domain, or site keyword such as github.");
      return;
    }

    const otherPatterns = replacedPattern
      ? draft.patterns.filter((item) => item !== replacedPattern)
      : draft.patterns;
    if (otherPatterns.includes(pattern)) {
      showMessage("That target is already included.");
      return;
    }

    const nextPatterns = replacedPattern
      ? draft.patterns.map((item) => (item === replacedPattern ? pattern : item))
      : [...draft.patterns, pattern];
    setDraft({ ...draft, patterns: nextPatterns });
    resetTargetEditor();
    showMessage("");
  }

  function addCurrentSite() {
    if (!tab?.url) return;
    saveTarget(tab.url, "site", undefined);
  }

  function removeTarget(pattern: string) {
    if (!draft) return;
    setDraft({ ...draft, patterns: draft.patterns.filter((item) => item !== pattern) });
    if (editingPattern === pattern) resetTargetEditor();
  }

  async function persistDraft() {
    if (!draft) return;
    const nextRules = normalizePriorities(
      rules.some((rule) => rule.id === draft.id)
        ? rules.map((rule) => (rule.id === draft.id ? draft : rule))
        : [...rules, draft],
    );
    if (!(await persistRules(nextRules))) return;

    setDraft(undefined);
    resetTargetEditor();
    showMessage("Saved.");
  }

  async function deleteDraft() {
    if (!draft) return;
    const previousRules = rules.map(cloneRule);
    const nextRules = normalizePriorities(rules.filter((rule) => rule.id !== draft.id));
    if (!(await persistRules(nextRules))) return;

    setDraft(undefined);
    resetTargetEditor();
    showMessage("Group deleted.", {
      label: "Undo group deletion",
      previousRules,
    });
  }

  async function updateRuleColor(ruleId: string, color: GroupColor) {
    const nextRules = rules.map((rule) => (rule.id === ruleId ? { ...rule, color } : rule));
    if (!(await persistRules(nextRules))) return;
    setColorMenuRuleId(undefined);
    showMessage("Color updated.");
  }

  async function reorderRule(
    sourceRuleId: string,
    targetRuleId: string,
    position: "before" | "after",
  ) {
    const nextRules = moveRule(rules, sourceRuleId, targetRuleId, position);
    if (!nextRules) return;
    const previousRules = rules.map(cloneRule);
    if (!(await persistRules(nextRules))) return;
    showMessage("Group moved.", { label: "Undo group move", previousRules });
  }

  async function moveRuleByKeyboard(ruleId: string, direction: -1 | 1) {
    const sourceIndex = rules.findIndex((rule) => rule.id === ruleId);
    const target = rules[sourceIndex + direction];
    if (sourceIndex < 0 || !target) return;
    await reorderRule(ruleId, target.id, direction < 0 ? "before" : "after");
  }

  async function undoLastChange() {
    if (!undoAction) return;
    const previousRules = undoAction.previousRules.map(cloneRule);
    if (!(await persistRules(previousRules))) return;
    showMessage("Change undone.");
  }

  async function persistRules(nextRules: GroupingRule[]): Promise<boolean> {
    const settings = await loadSettings();
    const normalizedRules = normalizePriorities(nextRules);
    const validation = validateSettings({ ...settings, rules: normalizedRules });
    if (!validation.value || validation.errors.length > 0) {
      showMessage(validation.errors.join(" ") || "Rule is invalid.");
      return false;
    }

    await saveSettings(validation.value);
    setRules(validation.value.rules);
    if (tab?.windowId !== undefined) {
      await safeSendMessage({ type: "reevaluate-window", windowId: tab.windowId });
    }
    return true;
  }

  function handleDragStart(event: DragEvent<HTMLButtonElement>, ruleId: string) {
    setDraggedRuleId(ruleId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", ruleId);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>, ruleId: string) {
    if (!draggedRuleId || draggedRuleId === ruleId) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const position = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
    setDropTarget({ ruleId, position });
    event.dataTransfer.dropEffect = "move";
  }

  function handleDrop(event: DragEvent<HTMLDivElement>, targetRuleId: string) {
    event.preventDefault();
    if (draggedRuleId && draggedRuleId !== targetRuleId) {
      const position = dropTarget?.ruleId === targetRuleId ? dropTarget.position : "before";
      void reorderRule(draggedRuleId, targetRuleId, position);
    }
    setDraggedRuleId(undefined);
    setDropTarget(undefined);
  }

  function handleDragEnd() {
    setDraggedRuleId(undefined);
    setDropTarget(undefined);
  }

  function handleReorderKeyDown(event: KeyboardEvent<HTMLButtonElement>, ruleId: string) {
    if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
    event.preventDefault();
    void moveRuleByKeyboard(ruleId, event.key === "ArrowUp" ? -1 : 1);
  }

  return (
    <main>
      <header>
        <div>
          <h1>AutoGrouping</h1>
          <p>Organize tabs by site without leaving this popup.</p>
        </div>
        <button
          type="button"
          className={enabled ? "automation-toggle running" : "automation-toggle paused"}
          onClick={() => void toggleEnabled()}
          aria-pressed={enabled}
        >
          <span className="automation-dot" aria-hidden="true" />
          <span>
            <small>Automatic grouping</small>
            <strong>{enabled ? "Running" : "Paused"}</strong>
          </span>
        </button>
      </header>

      <div className="current-status">
        <span>Current tab</span>
        <span className="current-status-copy">
          <strong>{tabStatus.title}</strong>
          {tabStatus.detail && <small>{tabStatus.detail}</small>}
        </span>
      </div>

      <section className="groups-section">
        <div className="section-heading">
          <div>
            <h2>Groups</h2>
            <span className="group-count">{rules.length}</span>
          </div>
          <button type="button" className="add-button" onClick={beginAddRule}>
            + Add group
          </button>
        </div>
        <p className="order-hint">Groups match from top to bottom and appear in this order.</p>

        <div className="group-table">
          <div className="table-header">
            <span aria-hidden="true" />
            <span className="table-heading">Name</span>
            <span className="table-heading">Target sites</span>
            <span className="table-heading">Color</span>
            <span aria-hidden="true" />
          </div>

          {rules.length === 0 && (
            <button type="button" className="empty-rule" onClick={beginAddRule}>
              No groups yet. Add your first group.
            </button>
          )}

          {rules.map((rule) => {
            const conflictNames = [...(conflictNamesByRule.get(rule.id) ?? [])];
            const rowClasses = [
              "rule-row",
              rule.enabled ? "" : "disabled",
              draggedRuleId === rule.id ? "dragging" : "",
              dropTarget?.ruleId === rule.id ? `drop-${dropTarget.position}` : "",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              // biome-ignore lint/a11y/noStaticElementInteractions: The row is a drop target with interactive controls inside.
              <div
                className={rowClasses}
                key={rule.id}
                onDragOver={(event) => handleDragOver(event, rule.id)}
                onDrop={(event) => handleDrop(event, rule.id)}
              >
                <button
                  type="button"
                  className="rule-drag-handle"
                  draggable
                  aria-label={`Reorder ${rule.name}`}
                  title="Drag to reorder. Alt + Arrow keys also work."
                  onDragStart={(event) => handleDragStart(event, rule.id)}
                  onDragEnd={handleDragEnd}
                  onKeyDown={(event) => handleReorderKeyDown(event, rule.id)}
                >
                  ⠿
                </button>
                <button type="button" className="name-cell" onClick={() => beginEditRule(rule)}>
                  <strong>{rule.name}</strong>
                  {!rule.enabled && <small>Paused</small>}
                  {conflictNames.length > 0 && (
                    <small className="conflict-label">Overlaps: {conflictNames.join(", ")}</small>
                  )}
                </button>
                <div className="targets-cell">
                  {rule.patterns.slice(0, 3).map((pattern) => {
                    const target = describePattern(pattern);
                    return (
                      <button
                        type="button"
                        className="target-chip"
                        title={pattern}
                        key={pattern}
                        onClick={() => beginEditTarget(rule, pattern)}
                      >
                        <strong>{target.label}</strong>
                        <small>{target.scope}</small>
                      </button>
                    );
                  })}
                  {rule.patterns.length > 3 && (
                    <button
                      type="button"
                      className="target-overflow"
                      onClick={() => beginEditRule(rule)}
                    >
                      +{rule.patterns.length - 3}
                    </button>
                  )}
                </div>
                <div className="color-cell">
                  <button
                    type="button"
                    className="table-color"
                    style={{ backgroundColor: GROUP_COLOR_HEX[rule.color] }}
                    aria-label={`Change ${rule.name} group color`}
                    aria-haspopup="listbox"
                    aria-expanded={colorMenuRuleId === rule.id}
                    onClick={() =>
                      setColorMenuRuleId((current) => (current === rule.id ? undefined : rule.id))
                    }
                  />
                  {colorMenuRuleId === rule.id && (
                    <div className="inline-color-picker" role="listbox" aria-label="Group color">
                      {GROUP_COLORS.map((color) => (
                        <button
                          type="button"
                          key={color}
                          role="option"
                          className={
                            color === rule.color
                              ? "inline-color-option selected"
                              : "inline-color-option"
                          }
                          style={{ backgroundColor: GROUP_COLOR_HEX[color] }}
                          aria-label={color}
                          aria-selected={color === rule.color}
                          onClick={() => void updateRuleColor(rule.id, color)}
                        />
                      ))}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className="edit-button"
                  aria-label={`Edit ${rule.name}`}
                  onClick={() => beginEditRule(rule)}
                >
                  ⋯
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {draft && (
        <section className="editor">
          <div className="editor-heading">
            <h2>{rules.some((rule) => rule.id === draft.id) ? "Edit group" : "Add group"}</h2>
            <button
              type="button"
              className="icon-button"
              aria-label="Close group editor"
              onClick={() => {
                setDraft(undefined);
                resetTargetEditor();
              }}
            >
              ×
            </button>
          </div>

          <label className="field">
            <span className="field-label">Group name</span>
            <input
              value={draft.name}
              placeholder="e.g. Research"
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setDraft({ ...draft, name: event.target.value })
              }
            />
          </label>

          <div className="field">
            <div className="field-heading">
              <span className="field-label">Target sites</span>
              {tab?.url && (
                <button type="button" className="text-button" onClick={addCurrentSite}>
                  + Current site
                </button>
              )}
            </div>

            <div className="target-list">
              {draft.patterns.length === 0 && <p>No sites selected.</p>}
              {draft.patterns.map((pattern) => {
                const target = describePattern(pattern);
                return (
                  <span
                    className={
                      editingPattern === pattern ? "editable-target editing" : "editable-target"
                    }
                    key={pattern}
                    title={pattern}
                  >
                    <button
                      type="button"
                      className="editable-target-main"
                      onClick={() => startEditingTarget(pattern)}
                    >
                      <strong>{target.label}</strong>
                      <small>{target.scope}</small>
                    </button>
                    <button
                      type="button"
                      className="remove-target"
                      aria-label={`Remove ${target.label}`}
                      onClick={() => removeTarget(pattern)}
                    >
                      ×
                    </button>
                  </span>
                );
              })}
            </div>

            <div className="target-adder">
              <input
                value={targetInput}
                placeholder="URL, domain, or keyword, e.g. github"
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setTargetInput(event.target.value)
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    saveTarget();
                  }
                }}
              />
              <select
                value={targetScope}
                aria-label="Target scope"
                onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                  setTargetScope(event.target.value as SiteScope)
                }
              >
                <option value="site">Entire site</option>
                <option value="path">This path</option>
                <option value="page">This page</option>
              </select>
              <button type="button" onClick={() => saveTarget()}>
                {editingPattern ? "Update" : "Add"}
              </button>
            </div>
            {editingPattern && (
              <button type="button" className="cancel-target-edit" onClick={resetTargetEditor}>
                Cancel target edit
              </button>
            )}
          </div>

          {draftConflictNames.length > 0 && (
            <div className="conflict-warning" role="status">
              <strong>Overlapping rule</strong>
              <span>
                This group also matches {quotedNames(draftConflictNames)}. The upper group takes
                priority.
              </span>
            </div>
          )}

          <fieldset>
            <legend>Color</legend>
            <div className="color-picker">
              {GROUP_COLORS.map((color) => (
                <button
                  type="button"
                  key={color}
                  className={draft.color === color ? "color-swatch selected" : "color-swatch"}
                  style={{ backgroundColor: GROUP_COLOR_HEX[color] }}
                  aria-label={color}
                  aria-pressed={draft.color === color}
                  onClick={() => setDraft({ ...draft, color })}
                />
              ))}
            </div>
          </fieldset>

          <details className="advanced-patterns">
            <summary>Advanced matching patterns</summary>
            <p>
              {
                "Use this only for wildcards inside a hostname or path, such as *.notion.site/* or github.com/*/issues/*."
              }
            </p>
            <textarea
              rows={3}
              value={draft.patterns.join("\n")}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
                resetTargetEditor();
                setDraft({
                  ...draft,
                  patterns: event.target.value
                    .split("\n")
                    .map((value) => value.trim())
                    .filter(Boolean),
                });
              }}
            />
          </details>

          <label className="enabled-control">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setDraft({ ...draft, enabled: event.target.checked })
              }
            />
            Use this automatic rule
          </label>

          <div className="editor-actions">
            {rules.some((rule) => rule.id === draft.id) && (
              <button type="button" className="danger" onClick={() => void deleteDraft()}>
                Delete
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setDraft(undefined);
                resetTargetEditor();
              }}
            >
              Cancel
            </button>
            <button type="button" className="primary" onClick={() => void persistDraft()}>
              Save
            </button>
          </div>
        </section>
      )}

      {message && (
        <div className="message" role="status">
          <span>{message}</span>
          {undoAction && (
            <button type="button" className="undo-button" onClick={() => void undoLastChange()}>
              Undo
            </button>
          )}
        </div>
      )}

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
    </main>
  );
}

async function safeSendMessage<T = unknown>(message: unknown): Promise<T | undefined> {
  try {
    return (await chrome.runtime.sendMessage(message)) as T;
  } catch {
    return undefined;
  }
}

async function fetchTabState(tabId: number): Promise<TabStateRecord | undefined> {
  const response = await safeSendMessage<StatusResponse>({ type: "get-status", tabId });
  return response?.state;
}

function patternFromInput(value: string, scope: SiteScope): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  if (/^[a-z0-9-]+$/i.test(trimmed)) return `${trimmed.toLowerCase()}/*`;

  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    if (!/^https?:$/.test(url.protocol) || !url.hostname) return undefined;
    if (scope === "site") return `${url.hostname}/*`;
    if (scope === "page") return `${url.hostname}${url.pathname}${url.search}`;
    const path = url.pathname === "/" ? "/" : url.pathname.replace(/\/+$/, "");
    return `${url.hostname}${path === "/" ? "/*" : `${path}*`}`;
  } catch {
    return undefined;
  }
}

function isSimplePattern(pattern: string): boolean {
  const normalized = pattern.replace(/^\*:\/\//, "").replace(/^https?:\/\//, "");
  const hostname = normalized.split("/")[0] ?? "";
  const path = normalized.slice(hostname.length);
  return !hostname.includes("*") && (!path.includes("*") || path.endsWith("*"));
}

function inferScope(pattern: string): SiteScope {
  const normalized = pattern.replace(/^\*:\/\//, "").replace(/^https?:\/\//, "");
  if (normalized.endsWith("/*")) return "site";
  if (normalized.endsWith("*")) return "path";
  return "page";
}

function patternToInput(pattern: string, scope: SiteScope): string {
  const normalized = pattern.replace(/^\*:\/\//, "").replace(/^https?:\/\//, "");
  if (scope === "site") return normalized.replace(/\/\*$/, "");
  if (scope === "path") return `https://${normalized.replace(/\*$/, "")}`;
  return `https://${normalized}`;
}

function describePattern(pattern: string): { label: string; scope: string } {
  const normalized = pattern.replace(/^\*:\/\//, "").replace(/^https?:\/\//, "");
  const slashIndex = normalized.indexOf("/");
  const hostname = slashIndex === -1 ? normalized : normalized.slice(0, slashIndex);
  const path = slashIndex === -1 ? "" : normalized.slice(slashIndex);
  if (/^[a-z0-9-]+$/i.test(hostname) && path === "/*") {
    return { label: hostname, scope: "Site keyword" };
  }
  if (path === "/*") return { label: hostname, scope: "Entire site" };
  if (!path) {
    return { label: hostname, scope: normalized.includes("*") ? "Custom" : "Exact host" };
  }
  if (path.includes("*")) {
    return { label: hostname, scope: `${path.replaceAll("*", "…")} path` };
  }
  return { label: hostname, scope: "Exact page" };
}

function describeTabStatus(
  state: TabStateRecord | undefined,
  tab: chrome.tabs.Tab | undefined,
  rules: readonly GroupingRule[],
): { title: string; detail?: string } {
  const matching = tab?.url ? findMatchingRuleDetail(tab.url, rules) : undefined;
  const managedRule = state?.managedRuleId
    ? rules.find((rule) => rule.id === state.managedRuleId)
    : matching?.rule;

  switch (state?.state) {
    case "managed":
      return {
        title: managedRule ? `Managed by ${managedRule.name}` : "Managed by AutoGrouping",
        detail: matching ? `Matched target: ${describePattern(matching.pattern).label}` : undefined,
      };
    case "protected-external":
      return { title: "In external group", detail: "External group ownership is preserved." };
    case "protected-user":
      return { title: "Protected manually", detail: "Use Return to automation to resume." };
    case "protected-split-view":
      return {
        title: "Protected by Split View",
        detail: "Grouping resumes after Split View ends.",
      };
    case "ignored-pinned":
      return { title: "Pinned and ignored", detail: "Pinned tabs remain in place." };
    case "unmatched":
      return { title: "No matching group", detail: hostnameDetail(tab?.url) };
    default:
      return {
        title: "Checking…",
        detail: matching ? `Potential match: ${matching.rule.name}` : hostnameDetail(tab?.url),
      };
  }
}

function hostnameDetail(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return `Hostname: ${new URL(url).hostname}`;
  } catch {
    return undefined;
  }
}

function moveRule(
  rules: readonly GroupingRule[],
  sourceRuleId: string,
  targetRuleId: string,
  position: "before" | "after",
): GroupingRule[] | undefined {
  if (sourceRuleId === targetRuleId) return undefined;
  const source = rules.find((rule) => rule.id === sourceRuleId);
  if (!source) return undefined;

  const remaining = rules.filter((rule) => rule.id !== sourceRuleId);
  const targetIndex = remaining.findIndex((rule) => rule.id === targetRuleId);
  if (targetIndex < 0) return undefined;

  const insertionIndex = targetIndex + (position === "after" ? 1 : 0);
  const next = [...remaining];
  next.splice(insertionIndex, 0, source);
  return normalizePriorities(next);
}

function normalizePriorities(rules: readonly GroupingRule[]): GroupingRule[] {
  return rules.map((rule, index) => ({ ...rule, patterns: [...rule.patterns], priority: index }));
}

function cloneRule(rule: GroupingRule): GroupingRule {
  return { ...rule, patterns: [...rule.patterns] };
}

function addMapValue(map: Map<string, Set<string>>, key: string, value: string): void {
  const values = map.get(key) ?? new Set<string>();
  values.add(value);
  map.set(key, values);
}

function quotedNames(names: readonly string[]): string {
  return names.map((name) => `“${name}”`).join(", ");
}
