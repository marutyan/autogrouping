import { useEffect, useState } from "react";
import type { GroupingRule } from "../../../src/core/types";

// 取り消し操作に必要な情報（アクション名と直前のルール一覧）。
// ルール削除や並び替えの直後に直前状態へ巻き戻すためのボタン表示に使う。
export interface UndoAction {
  label: string;
  previousRules: GroupingRule[];
}

// 一時的な通知メッセージと取り消し（Undo）操作の表示および自動消去タイマーを管理するhook。
// メッセージ内容やUndoの有無に応じて消去時間を切り替え、操作フィードバックを提示する。
export function useTransientMessage() {
  const [message, setMessage] = useState("");
  const [undoAction, setUndoAction] = useState<UndoAction>();

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

  function showMessage(nextMessage: string, nextUndo?: UndoAction) {
    setMessage(nextMessage);
    setUndoAction(nextUndo);
  }

  function clearMessage() {
    setMessage("");
    setUndoAction(undefined);
  }

  return {
    message,
    undoAction,
    showMessage,
    clearMessage,
  };
}
