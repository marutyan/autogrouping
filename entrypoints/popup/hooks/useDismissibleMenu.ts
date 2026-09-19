import { useEffect, useRef, useState } from "react";

// ドロップダウンメニューの開閉状態と、外部クリックやEscapeキー押下による自動消去を管理するhook。
// 「Add this site…」メニューなどの展開中に、画面外の操作やキーボード操作で確実に閉じるために使う。
export function useDismissibleMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && containerRef.current && containerRef.current.contains(target)) {
        return;
      }
      setIsOpen(false);
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  function toggleMenu() {
    setIsOpen((prev) => !prev);
  }

  function closeMenu() {
    setIsOpen(false);
  }

  return {
    isOpen,
    setIsOpen,
    toggleMenu,
    closeMenu,
    containerRef,
  };
}
