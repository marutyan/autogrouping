import type { ChangeEvent } from "react";
import type { SiteScope } from "../../../src/core/pattern-input";
import type { GroupColor, GroupingRule } from "../../../src/core/types";
import { quotedNames } from "../../../src/ui/rule-conflicts-summary";
import { ColorSwatches } from "./ColorSwatches";
import { Switch } from "./Switch";
import { TargetEditor } from "./TargetEditor";

// GroupEditor コンポーネントのプロパティ型定義。
// 編集中ドラフト、既存判定、重複先名一覧、各種入力状態とイベントハンドラを受け取る。
export interface GroupEditorProps {
  draft: GroupingRule;
  isExisting: boolean;
  draftConflictNames: readonly string[];
  tabUrl: string | undefined;
  targetInput: string;
  targetScope: SiteScope;
  editingPattern: string | undefined;
  onDraftChange: (nextDraft: GroupingRule) => void;
  onResetDraft: () => void;
  onPersistDraft: () => void;
  onDeleteDraft: () => void;
  onTargetInputChange: (value: string) => void;
  onTargetScopeChange: (scope: SiteScope) => void;
  onStartEditingTarget: (pattern: string) => void;
  onRemoveTarget: (pattern: string) => void;
  onSaveTarget: () => void;
  onResetTargetEditor: () => void;
  onAddCurrentSite: () => void;
}

// グループの新規作成および編集画面全体を表示するコンポーネント。
// ヘッダーナビゲーション、グループ名入力、カラー選択、対象URL管理、重複警告、詳細パターン、保存操作を提供する。
export function GroupEditor({
  draft,
  isExisting,
  draftConflictNames,
  tabUrl,
  targetInput,
  targetScope,
  editingPattern,
  onDraftChange,
  onResetDraft,
  onPersistDraft,
  onDeleteDraft,
  onTargetInputChange,
  onTargetScopeChange,
  onStartEditingTarget,
  onRemoveTarget,
  onSaveTarget,
  onResetTargetEditor,
  onAddCurrentSite,
}: GroupEditorProps) {
  function handleNameChange(event: ChangeEvent<HTMLInputElement>) {
    onDraftChange({ ...draft, name: event.target.value });
  }

  function handleColorSelect(color: GroupColor) {
    onDraftChange({ ...draft, color });
  }

  function handleEnabledToggle() {
    onDraftChange({ ...draft, enabled: !draft.enabled });
  }

  function handleAdvancedPatternsChange(event: ChangeEvent<HTMLTextAreaElement>) {
    onResetTargetEditor();
    const patterns = event.target.value
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
    onDraftChange({ ...draft, patterns });
  }

  return (
    <section className="editor">
      <div className="editor-header">
        <div className="editor-header-left">
          <button
            type="button"
            className="icon-button back-button"
            aria-label="Back to groups"
            onClick={onResetDraft}
          >
            ←
          </button>
          <h2>{isExisting ? "Edit group" : "New group"}</h2>
        </div>
        {isExisting && (
          <button type="button" className="danger-button text-button" onClick={onDeleteDraft}>
            Delete
          </button>
        )}
      </div>

      <label className="field">
        <span className="field-label">Group name</span>
        <input value={draft.name} placeholder="e.g. Research" onChange={handleNameChange} />
      </label>

      <ColorSwatches selectedColor={draft.color} onSelectColor={handleColorSelect} />

      <TargetEditor
        patterns={draft.patterns}
        targetInput={targetInput}
        targetScope={targetScope}
        editingPattern={editingPattern}
        tabUrl={tabUrl}
        onTargetInputChange={onTargetInputChange}
        onTargetScopeChange={onTargetScopeChange}
        onStartEditingTarget={onStartEditingTarget}
        onRemoveTarget={onRemoveTarget}
        onSaveTarget={onSaveTarget}
        onResetTargetEditor={onResetTargetEditor}
        onAddCurrentSite={onAddCurrentSite}
      />

      {draftConflictNames.length > 0 && (
        <div className="conflict-warning" role="status">
          <strong>Overlapping rule</strong>
          <span>
            {" — "}This group also matches {quotedNames(draftConflictNames)}. The upper group takes
            priority.
          </span>
        </div>
      )}

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
          onChange={handleAdvancedPatternsChange}
        />
      </details>

      <div className="editor-actions-row">
        <div className="enabled-switch-container">
          <Switch
            checked={draft.enabled}
            ariaLabel="Use this rule"
            onChange={handleEnabledToggle}
          />
          <span className="switch-label-text">Use this rule</span>
        </div>

        <div className="editor-submit-buttons">
          <button type="button" className="secondary-button" onClick={onResetDraft}>
            Cancel
          </button>
          <button type="button" className="primary-button" onClick={onPersistDraft}>
            Save
          </button>
        </div>
      </div>
    </section>
  );
}
