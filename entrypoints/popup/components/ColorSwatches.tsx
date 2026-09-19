import type { GroupColor } from "../../../src/core/types";
import { GROUP_COLORS, GROUP_COLOR_HEX } from "../../../src/ui/group-colors";

// ColorSwatches コンポーネントのプロパティ型定義。
// 現在選択中のグループ色と、色変更時のコールバック関数を受け取る。
export interface ColorSwatchesProps {
  selectedColor: GroupColor;
  onSelectColor: (color: GroupColor) => void;
}

// グループの配色を選択するカラーパレットコンポーネント。
// Chromeで利用可能な全9色の丸形スウォッチボタンを並べ、選択中の色をリング強調表示する。
export function ColorSwatches({ selectedColor, onSelectColor }: ColorSwatchesProps) {
  return (
    <fieldset className="color-swatches-field">
      <legend className="field-label">Color</legend>
      <div className="color-swatches-grid">
        {GROUP_COLORS.map((color) => {
          const isSelected = selectedColor === color;
          return (
            <button
              type="button"
              key={color}
              className={`color-swatch ${isSelected ? "selected" : ""}`}
              style={{ backgroundColor: GROUP_COLOR_HEX[color] }}
              aria-label={color}
              aria-pressed={isSelected}
              onClick={() => onSelectColor(color)}
            />
          );
        })}
      </div>
    </fieldset>
  );
}
