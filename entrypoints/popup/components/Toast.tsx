import type { UndoAction } from "../hooks/useTransientMessage";

// Toast コンポーネントのプロパティ型定義。
// 通知メッセージ、Undo操作情報、およびUndo実行コールバックを受け取る。
export interface ToastProps {
  message: string;
  undoAction: UndoAction | undefined;
  onUndo: () => void;
}

// 画面下部に固定表示される一時メッセージ通知コンポーネント。
// 保存や削除などの操作フィードバックと、直前の変更を巻き戻すUndoボタンを提供する。
export function Toast({ message, undoAction, onUndo }: ToastProps) {
  if (!message) return null;

  return (
    <div className="toast" role="status">
      <span className="toast-text">{message}</span>
      {undoAction && (
        <button type="button" className="toast-undo-button" onClick={onUndo}>
          Undo
        </button>
      )}
    </div>
  );
}
