import { useMemo, type ChangeEvent } from "react";
import { describePattern, type SiteScope } from "../../src/core/pattern-input";
import { cloneRule, moveRule, removeRule, upsertRule } from "../../src/core/rule-list";
import type { GroupColor } from "../../src/core/types";
import { GROUP_COLORS, GROUP_COLOR_HEX } from "../../src/ui/group-colors";
import {
  findConflictNamesByRule,
  findDraftConflictNames,
  quotedNames,
} from "../../src/ui/rule-conflicts-summary";
import { protectTab, reevaluateWindow, returnTab } from "../../src/ui/background-client";
import { describeTabStatus } from "../../src/ui/tab-status";
import { useColorMenu } from "./hooks/useColorMenu";
import { useCurrentTab } from "./hooks/useCurrentTab";
import { useRuleDraft } from "./hooks/useRuleDraft";
import { useRuleReorder } from "./hooks/useRuleReorder";
import { useSettings } from "./hooks/useSettings";
import { useTransientMessage } from "./hooks/useTransientMessage";

// Chrome拡張機能 AutoGrouping のポップアップUIメインコンポーネント。
// 各種カスタムhookから状態と操作を受け取り、ルール一覧・ドラフト編集・タブ状態のJSX表示を構築する。
export function PopupApp() {
  const { tab, state, refreshTabState } = useCurrentTab();
  const { message, undoAction, showMessage } = useTransientMessage();
  const {
    enabled,
    rules,
    toggleEnabled: toggleSettingsEnabled,
    persistRules,
  } = useSettings(tab?.windowId);

  const {
    draft,
    setDraft,
    targetInput,
    setTargetInput,
    targetScope,
    setTargetScope,
    editingPattern,
    resetTargetEditor,
    resetDraft,
    beginAddRule,
    beginEditRule,
    beginEditTarget,
    startEditingTarget,
    saveTarget,
    addCurrentSite,
    removeTarget,
  } = useRuleDraft({
    rules,
    currentTabUrl: tab?.url,
    onMessage: showMessage,
  });

  const { colorMenuRuleId, setColorMenuRuleId } = useColorMenu();

  const {
    draggedRuleId,
    dropTarget,
    handleDragStart,
    handleDragOver,
    handleDrop,
    handleDragEnd,
    handleReorderKeyDown,
  } = useRuleReorder({
    rules,
    onReorder: reorderRule,
  });

  const conflictNamesByRule = useMemo(() => findConflictNamesByRule(rules), [rules]);
  const draftConflictNames = useMemo(() => findDraftConflictNames(rules, draft), [draft, rules]);
  const tabStatus = useMemo(() => describeTabStatus(state, tab, rules), [state, tab, rules]);

  async function toggleEnabled() {
    const next = await toggleSettingsEnabled();
    showMessage(next ? "Automatic grouping resumed." : "Automatic grouping paused.");
  }

  async function send(type: "return-tab" | "protect-tab" | "reevaluate-window") {
    if (!tab) return;
    const response =
      type === "return-tab" && tab.id !== undefined
        ? await returnTab(tab.id)
        : type === "protect-tab" && tab.id !== undefined
          ? await protectTab(tab.id)
          : type === "reevaluate-window" && tab.windowId !== undefined
            ? await reevaluateWindow(tab.windowId)
            : undefined;
    if (response === undefined) {
      showMessage("Background service is restarting. Reopen the popup and try again.");
      return;
    }
    await refreshTabState();
  }

  async function persistDraft() {
    if (!draft) return;
    const nextRules = upsertRule(rules, draft);
    const result = await persistRules(nextRules);
    if (!result.ok) {
      showMessage(result.error);
      return;
    }
    resetDraft();
    showMessage("Saved.");
  }

  async function deleteDraft() {
    if (!draft) return;
    const previousRules = rules.map(cloneRule);
    const nextRules = removeRule(rules, draft.id);
    const result = await persistRules(nextRules);
    if (!result.ok) {
      showMessage(result.error);
      return;
    }
    resetDraft();
    showMessage("Group deleted.", {
      label: "Undo group deletion",
      previousRules,
    });
  }

  async function updateRuleColor(ruleId: string, color: GroupColor) {
    const nextRules = rules.map((rule) => (rule.id === ruleId ? { ...rule, color } : rule));
    const result = await persistRules(nextRules);
    if (!result.ok) {
      showMessage(result.error);
      return;
    }
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
    const result = await persistRules(nextRules);
    if (!result.ok) {
      showMessage(result.error);
      return;
    }
    showMessage("Group moved.", { label: "Undo group move", previousRules });
  }

  async function undoLastChange() {
    if (!undoAction) return;
    const previousRules = undoAction.previousRules.map(cloneRule);
    const result = await persistRules(previousRules);
    if (!result.ok) {
      showMessage(result.error);
      return;
    }
    showMessage("Change undone.");
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
