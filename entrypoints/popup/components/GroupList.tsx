import type { DragEvent, KeyboardEvent } from "react";
import type { GroupingRule } from "../../../src/core/types";
import type { DropTarget } from "../hooks/useRuleReorder";
import { GroupRow } from "./GroupRow";

// GroupList コンポーネントのプロパティ型定義。
// ルール配列、ルール別重複名マップ、DnD状態、および編集・作成・並び替えイベントハンドラを受け取る。
export interface GroupListProps {
  rules: readonly GroupingRule[];
  conflictNamesByRule: Map<string, Set<string>>;
  draggedRuleId: string | undefined;
  dropTarget: DropTarget | undefined;
  onEditRule: (rule: GroupingRule) => void;
  onAddRule: () => void;
  onToggleRuleEnabled: (ruleId: string) => void;
  onDragStart: (event: DragEvent<HTMLButtonElement>, ruleId: string) => void;
  onDragOver: (event: DragEvent<HTMLDivElement>, ruleId: string) => void;
  onDrop: (event: DragEvent<HTMLDivElement>, ruleId: string) => void;
  onDragEnd: () => void;
  onReorderKeyDown: (event: KeyboardEvent<HTMLButtonElement>, ruleId: string) => void;
}

// 登録済みグループの一覧とセクション見出しを表示するコンポーネント。
// 件数バッジ・評価順序案内文・各グループ行、および未登録時の初期追加ボタンを提供する。
export function GroupList({
  rules,
  conflictNamesByRule,
  draggedRuleId,
  dropTarget,
  onEditRule,
  onAddRule,
  onToggleRuleEnabled,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onReorderKeyDown,
}: GroupListProps) {
  return (
    <section className="groups-section">
      <div className="section-heading">
        <div className="section-title">
          <h2>Groups</h2>
          <span className="group-count">{rules.length}</span>
        </div>
        <span className="order-hint">Matched top to bottom</span>
      </div>

      <div className="rule-list">
        {rules.length === 0 && (
          <button type="button" className="empty-rule" onClick={onAddRule}>
            No groups yet. Add your first group.
          </button>
        )}

        {rules.map((rule) => {
          const conflictNames = [...(conflictNamesByRule.get(rule.id) ?? [])];
          const isDragging = draggedRuleId === rule.id;
          const dropPosition = dropTarget?.ruleId === rule.id ? dropTarget.position : undefined;

          return (
            <GroupRow
              key={rule.id}
              rule={rule}
              conflictNames={conflictNames}
              isDragging={isDragging}
              dropPosition={dropPosition}
              onEdit={onEditRule}
              onToggleEnabled={onToggleRuleEnabled}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onDragEnd={onDragEnd}
              onReorderKeyDown={onReorderKeyDown}
            />
          );
        })}
      </div>
    </section>
  );
}
