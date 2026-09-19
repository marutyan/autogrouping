import { useEffect, useState } from "react";

// ルール一覧のカラーパレットメニューの開閉状態と、領域外クリックやEscapeキーによるメニュー消去を管理するhook。
// カラーメニュー表示中に画面の他の箇所が操作された際、確実にメニューを閉じるために使う。
export function useColorMenu() {
  const [colorMenuRuleId, setColorMenuRuleId] = useState<string>();

  useEffect(() => {
    if (!colorMenuRuleId) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".color-cell")) return;
      setColorMenuRuleId(undefined);
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setColorMenuRuleId(undefined);
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [colorMenuRuleId]);

  return {
    colorMenuRuleId,
    setColorMenuRuleId,
  };
}
