// Switch コンポーネントのプロパティ型定義。
// 有効/無効状態、アクセシビリティラベル、変更ハンドラ、無効化フラグを受け取る。
export interface SwitchProps {
  checked: boolean;
  ariaLabel: string;
  onChange: () => void;
  disabled?: boolean;
}

// ON/OFFを切り替えるトグルスイッチコンポーネント。
// ヘッダーの自動化設定、一覧の一時停止トグル、エディタのルール有効化設定で共通利用する。
export function Switch({ checked, ariaLabel, onChange, disabled }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      className={`switch ${checked ? "checked" : ""}`}
      onClick={onChange}
    >
      <span className="switch-thumb" aria-hidden="true" />
    </button>
  );
}
