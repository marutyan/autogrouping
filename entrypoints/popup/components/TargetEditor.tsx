import type { ChangeEvent, KeyboardEvent } from "react";
import { describePattern, type SiteScope } from "../../../src/core/pattern-input";

// TargetEditor コンポーネントのプロパティ型定義。
// パターン一覧、入力文字列、スコープ、編集中パターン、現在タブURL、および各種操作関数を受け取る。
export interface TargetEditorProps {
  patterns: readonly string[];
  targetInput: string;
  targetScope: SiteScope;
  editingPattern: string | undefined;
  tabUrl: string | undefined;
  onTargetInputChange: (value: string) => void;
  onTargetScopeChange: (scope: SiteScope) => void;
  onStartEditingTarget: (pattern: string) => void;
  onRemoveTarget: (pattern: string) => void;
  onSaveTarget: () => void;
  onResetTargetEditor: () => void;
  onAddCurrentSite: () => void;
}

// ルールのマッチ対象URLパターンを一覧表示・追加・編集・削除するコンポーネント。
// チップによる一覧確認、現在サイトの一発追加ボタン、スコープ付き入力欄を提供する。
export function TargetEditor({
  patterns,
  targetInput,
  targetScope,
  editingPattern,
  tabUrl,
  onTargetInputChange,
  onTargetScopeChange,
  onStartEditingTarget,
  onRemoveTarget,
  onSaveTarget,
  onResetTargetEditor,
  onAddCurrentSite,
}: TargetEditorProps) {
  let hostname = "";
  const isHttp = tabUrl ? tabUrl.startsWith("http://") || tabUrl.startsWith("https://") : false;
  if (isHttp && tabUrl) {
    try {
      hostname = new URL(tabUrl).hostname;
    } catch {
      hostname = "";
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      onSaveTarget();
    }
  }

  return (
    <div className="field">
      <div className="field-heading">
        <span className="field-label">Target sites</span>
        {isHttp && (
          <button type="button" className="text-button" onClick={onAddCurrentSite}>
            + Add current site {hostname ? `(${hostname})` : ""}
          </button>
        )}
      </div>

      <div className="target-list">
        {patterns.length === 0 && <p className="empty-hint">No sites selected.</p>}
        {patterns.map((pattern) => {
          const target = describePattern(pattern);
          const isEditing = editingPattern === pattern;

          return (
            <span
              className={`editable-target ${isEditing ? "editing" : ""}`}
              key={pattern}
              title={pattern}
            >
              <button
                type="button"
                className="editable-target-main"
                onClick={() => onStartEditingTarget(pattern)}
              >
                <strong>{target.label}</strong>
                <small>{target.scope}</small>
              </button>
              <button
                type="button"
                className="remove-target"
                aria-label={`Remove ${target.label}`}
                onClick={() => onRemoveTarget(pattern)}
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
            onTargetInputChange(event.target.value)
          }
          onKeyDown={handleKeyDown}
        />
        <select
          value={targetScope}
          aria-label="Target scope"
          onChange={(event: ChangeEvent<HTMLSelectElement>) =>
            onTargetScopeChange(event.target.value as SiteScope)
          }
        >
          <option value="site">Entire site</option>
          <option value="path">This path</option>
          <option value="page">This page</option>
        </select>
        <button type="button" className="action-button-tonal" onClick={onSaveTarget}>
          {editingPattern ? "Update" : "Add"}
        </button>
      </div>

      {editingPattern && (
        <button type="button" className="cancel-target-edit" onClick={onResetTargetEditor}>
          Cancel target edit
        </button>
      )}
    </div>
  );
}
