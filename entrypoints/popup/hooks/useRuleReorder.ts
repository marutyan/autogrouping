import { type DragEvent, type KeyboardEvent, useState } from "react";
import type { GroupingRule } from "../../../src/core/types";

// 並び替えドロップ先の対象情報（相手のルールIDと前後の挿入位置）。
// ドロップインジケータの表示やドロップ時の挿入インデックス決定に使う。
export interface DropTarget {
  ruleId: string;
  position: "before" | "after";
}

// useRuleReorder hook の初期化オプション。
// 現在のルール配列と並び替え確定時の非同期コールバックを受け取る。
export interface UseRuleReorderOptions {
  rules: readonly GroupingRule[];
  onReorder: (
    sourceRuleId: string,
    targetRuleId: string,
    position: "before" | "after",
  ) => void | Promise<void>;
}

// ルール一覧のドラッグ&ドロップおよびキーボード（Alt+上下矢印）による並び替え操作を管理するhook。
// ドラッグ中のID保持やドロップ先判定、各種DOMイベントハンドラを提供する。
export function useRuleReorder({ rules, onReorder }: UseRuleReorderOptions) {
  const [draggedRuleId, setDraggedRuleId] = useState<string>();
  const [dropTarget, setDropTarget] = useState<DropTarget>();

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
      void onReorder(draggedRuleId, targetRuleId, position);
    }
    setDraggedRuleId(undefined);
    setDropTarget(undefined);
  }

  function handleDragEnd() {
    setDraggedRuleId(undefined);
    setDropTarget(undefined);
  }

  async function moveRuleByKeyboard(ruleId: string, direction: -1 | 1) {
    const sourceIndex = rules.findIndex((rule) => rule.id === ruleId);
    const target = rules[sourceIndex + direction];
    if (sourceIndex < 0 || !target) return;
    await onReorder(ruleId, target.id, direction < 0 ? "before" : "after");
  }

  function handleReorderKeyDown(event: KeyboardEvent<HTMLButtonElement>, ruleId: string) {
    if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
    event.preventDefault();
    void moveRuleByKeyboard(ruleId, event.key === "ArrowUp" ? -1 : 1);
  }

  return {
    draggedRuleId,
    dropTarget,
    handleDragStart,
    handleDragOver,
    handleDrop,
    handleDragEnd,
    handleReorderKeyDown,
  };
}
