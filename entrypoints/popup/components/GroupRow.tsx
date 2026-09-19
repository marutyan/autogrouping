import type { DragEvent, KeyboardEvent } from "react";
import type { GroupingRule } from "../../../src/core/types";
import { GROUP_COLOR_HEX } from "../../../src/ui/group-colors";
import { formatRuleSummary } from "../../../src/ui/rule-summary";
import { Switch } from "./Switch";

// GroupRow コンポーネントのプロパティ型定義。
// ルール情報、重複ルール名一覧、ドラッグ&ドロップ状態、および各種操作コールバックを受け取る。
export interface GroupRowProps {
  rule: GroupingRule;
  conflictNames: readonly string[];
  isDragging: boolean;
  dropPosition: "before" | "after" | undefined;
  onEdit: (rule: GroupingRule) => void;
  onToggleEnabled: (ruleId: string) => void;
  onDragStart: (event: DragEvent<HTMLButtonElement>, ruleId: string) => void;
  onDragOver: (event: DragEvent<HTMLDivElement>, ruleId: string) => void;
  onDrop: (event: DragEvent<HTMLDivElement>, ruleId: string) => void;
  onDragEnd: () => void;
  onReorderKeyDown: (event: KeyboardEvent<HTMLButtonElement>, ruleId: string) => void;
}

// グループ一覧の1行を表示するコンポーネント。
// ドラッグ取っ手・グループ色ドット・編集画面を開く主ボタン（名前と要約）・一時停止スイッチで構成される。
export function GroupRow({
  rule,
  conflictNames,
  isDragging,
  dropPosition,
  onEdit,
  onToggleEnabled,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onReorderKeyDown,
}: GroupRowProps) {
  const summary = formatRuleSummary(rule.patterns);
  const rowClasses = [
    "rule-row",
    rule.enabled ? "" : "disabled",
    isDragging ? "dragging" : "",
    dropPosition ? `drop-${dropPosition}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: The row is a drop target with interactive controls inside.
    <div
      className={rowClasses}
      onDragOver={(event) => onDragOver(event, rule.id)}
      onDrop={(event) => onDrop(event, rule.id)}
    >
      <button
        type="button"
        className="rule-drag-handle"
        draggable
        aria-label={`Reorder ${rule.name}`}
        title="Drag to reorder. Alt + Arrow keys also work."
        onDragStart={(event) => onDragStart(event, rule.id)}
        onDragEnd={onDragEnd}
        onKeyDown={(event) => onReorderKeyDown(event, rule.id)}
      >
        ⠿
      </button>

      <span
        className="color-dot"
        style={{ backgroundColor: GROUP_COLOR_HEX[rule.color] }}
        aria-hidden="true"
      />

      <button
        type="button"
        className="rule-open"
        aria-label={`Edit ${rule.name}`}
        onClick={() => onEdit(rule)}
      >
        <span className={`rule-name ${rule.enabled ? "" : "muted"}`}>{rule.name}</span>
        <span className="rule-summary">
          <span>{summary}</span>
          {!rule.enabled && <span className="paused-tag"> · Paused</span>}
          {conflictNames.length > 0 && (
            <span className="conflict-label"> Overlaps: {conflictNames.join(", ")}</span>
          )}
        </span>
      </button>

      <div className="rule-switch-cell">
        <Switch
          checked={rule.enabled}
          ariaLabel={`Use ${rule.name}`}
          onChange={() => onToggleEnabled(rule.id)}
        />
      </div>
    </div>
  );
}
