import { Switch } from "./Switch";

// PopupHeader コンポーネントのプロパティ型定義。
// 自動グルーピング全体の実行中フラグと、トグル操作用のコールバック関数を受け取る。
export interface PopupHeaderProps {
  enabled: boolean;
  onToggleEnabled: () => void;
}

// ポップアップ上部のヘッダーバーを表示するコンポーネント。
// ロゴアイコン・アプリ名と、自動グルーピング機能全体の一時停止・再開スイッチを提供する。
export function PopupHeader({ enabled, onToggleEnabled }: PopupHeaderProps) {
  return (
    <header className="popup-header">
      <div className="logo-group">
        <span className="logo-mark" aria-hidden="true" />
        <span className="logo-title">AutoGrouping</span>
      </div>
      <div className="header-toggle">
        <span className="toggle-label">Automatic grouping</span>
        <Switch checked={enabled} ariaLabel="Automatic grouping" onChange={onToggleEnabled} />
      </div>
    </header>
  );
}
