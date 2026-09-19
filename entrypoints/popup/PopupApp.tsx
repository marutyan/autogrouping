import { useMemo } from "react";
import { patternFromInput } from "../../src/core/pattern-input";
import {
  addPatternToRule,
  cloneRule,
  moveRule,
  removeRule,
  upsertRule,
} from "../../src/core/rule-list";
import type { GroupingRule } from "../../src/core/types";
import { protectTab, reevaluateWindow, returnTab } from "../../src/ui/background-client";
import {
  findConflictNamesByRule,
  findDraftConflictNames,
} from "../../src/ui/rule-conflicts-summary";
import { AddSiteMenu } from "./components/AddSiteMenu";
import { GroupEditor } from "./components/GroupEditor";
import { GroupList } from "./components/GroupList";
import { PopupHeader } from "./components/PopupHeader";
import { StatusCard } from "./components/StatusCard";
import { Toast } from "./components/Toast";
import { useCurrentTab } from "./hooks/useCurrentTab";
import { useRuleDraft } from "./hooks/useRuleDraft";
import { useRuleReorder } from "./hooks/useRuleReorder";
import { useSettings } from "./hooks/useSettings";
import { useTransientMessage } from "./hooks/useTransientMessage";

// Chrome拡張機能 AutoGrouping のポップアップUIメインコンポーネント。
// 設定・タブ状態・編集ドラフト・並び替えの各hookを統括し、一覧画面と編集画面の2画面を切り替えて描画する。
export function PopupApp() {
  const { tab, state, refreshTabState } = useCurrentTab();
  const { message, undoAction, showMessage } = useTransientMessage();
  const {
    enabled,
    rules,
    toggleEnabled: toggleSettingsEnabled,
    toggleRuleEnabled,
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
    beginAddRuleWithPatterns,
    beginEditRule,
    startEditingTarget,
    saveTarget,
    addCurrentSite,
    removeTarget,
  } = useRuleDraft({
    rules,
    currentTabUrl: tab?.url,
    onMessage: showMessage,
  });

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
    onReorder: handleReorderRule,
  });

  const conflictNamesByRule = useMemo(() => findConflictNamesByRule(rules), [rules]);
  const draftConflictNames = useMemo(() => findDraftConflictNames(rules, draft), [draft, rules]);

  const isDraftExisting = useMemo(
    () => (draft ? rules.some((rule) => rule.id === draft.id) : false),
    [draft, rules],
  );

  async function handleToggleEnabled() {
    const next = await toggleSettingsEnabled();
    showMessage(next ? "Automatic grouping resumed." : "Automatic grouping paused.");
  }

  async function handleToggleRuleEnabled(ruleId: string) {
    const next = await toggleRuleEnabled(ruleId);
    if (next !== undefined) {
      showMessage(next ? "Group resumed." : "Group paused.");
    }
  }

  async function handleTabAction(type: "return-tab" | "protect-tab" | "reevaluate-window") {
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

  async function handlePersistDraft() {
    if (!draft) return;
    const result = await persistRules((current) => upsertRule(current, draft));
    if (!result.ok) {
      showMessage(result.error);
      return;
    }
    resetDraft();
    showMessage("Saved.");
  }

  async function handleDeleteDraft() {
    if (!draft) return;
    const previousRules = rules.map(cloneRule);
    const result = await persistRules((current) => removeRule(current, draft.id));
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

  async function handleReorderRule(
    sourceRuleId: string,
    targetRuleId: string,
    position: "before" | "after",
  ) {
    const previousRules = rules.map(cloneRule);
    const result = await persistRules((current) => {
      const next = moveRule(current, sourceRuleId, targetRuleId, position);
      return next ?? current;
    });
    if (!result.ok) {
      showMessage(result.error);
      return;
    }
    showMessage("Group moved.", { label: "Undo group move", previousRules });
  }

  async function handleUndo() {
    if (!undoAction) return;
    const previousRules = undoAction.previousRules.map(cloneRule);
    const result = await persistRules(() => previousRules);
    if (!result.ok) {
      showMessage(result.error);
      return;
    }
    showMessage("Change undone.");
  }

  async function handleAddSiteToGroup(rule: GroupingRule) {
    if (!tab?.url) return;
    const pattern = patternFromInput(tab.url, "site");
    if (!pattern) return;

    let host = "";
    try {
      host = new URL(tab.url).hostname;
    } catch {
      host = tab.url;
    }

    if (rule.patterns.includes(pattern)) {
      showMessage(`That site is already in ${rule.name}.`);
      return;
    }

    const result = await persistRules((current) => addPatternToRule(current, rule.id, pattern));
    if (!result.ok) {
      showMessage(result.error);
      return;
    }
    showMessage(`Added ${host} to ${rule.name}.`);
  }

  function handleNewGroupWithSite() {
    if (tab?.url) {
      const pattern = patternFromInput(tab.url, "site");
      if (pattern) {
        beginAddRuleWithPatterns([pattern]);
        return;
      }
    }
    beginAddRule();
  }

  return (
    <main>
      {draft ? (
        <GroupEditor
          draft={draft}
          isExisting={isDraftExisting}
          draftConflictNames={draftConflictNames}
          tabUrl={tab?.url}
          targetInput={targetInput}
          targetScope={targetScope}
          editingPattern={editingPattern}
          onDraftChange={setDraft}
          onResetDraft={resetDraft}
          onPersistDraft={() => void handlePersistDraft()}
          onDeleteDraft={() => void handleDeleteDraft()}
          onTargetInputChange={setTargetInput}
          onTargetScopeChange={setTargetScope}
          onStartEditingTarget={startEditingTarget}
          onRemoveTarget={removeTarget}
          onSaveTarget={() => saveTarget()}
          onResetTargetEditor={resetTargetEditor}
          onAddCurrentSite={addCurrentSite}
        />
      ) : (
        <>
          <PopupHeader enabled={enabled} onToggleEnabled={() => void handleToggleEnabled()} />
          <StatusCard
            tab={tab}
            state={state}
            rules={rules}
            onAction={(type) => void handleTabAction(type)}
          />
          <GroupList
            rules={rules}
            conflictNamesByRule={conflictNamesByRule}
            draggedRuleId={draggedRuleId}
            dropTarget={dropTarget}
            onEditRule={beginEditRule}
            onAddRule={() => beginAddRule()}
            onToggleRuleEnabled={(ruleId) => void handleToggleRuleEnabled(ruleId)}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
            onReorderKeyDown={handleReorderKeyDown}
          />
          <AddSiteMenu
            tabUrl={tab?.url}
            rules={rules}
            onAddGroup={() => beginAddRule()}
            onAddSiteToGroup={(rule) => void handleAddSiteToGroup(rule)}
            onNewGroupWithSite={handleNewGroupWithSite}
          />
        </>
      )}

      <Toast message={message} undoAction={undoAction} onUndo={() => void handleUndo()} />
    </main>
  );
}
