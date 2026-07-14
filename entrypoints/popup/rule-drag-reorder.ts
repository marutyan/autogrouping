import type { GroupingRule } from "../../src/core/types";
import { loadSettings, saveSettings } from "../../src/ui/storage";

const STYLE_ID = "autogrouping-rule-drag-style";
const ROW_SELECTOR = ".group-table .rule-row";
const HANDLE_CLASS = "rule-drag-handle";
const DROP_BEFORE_CLASS = "drop-before";
const DROP_AFTER_CLASS = "drop-after";
const ADVANCED_LABEL = "Backup & advanced settings";

let draggedRow: HTMLElement | undefined;
let dropPosition: "before" | "after" = "before";

export function installRuleDragReorder(): () => void {
  installStyles();
  enhanceTable();

  const observer = new MutationObserver(() => enhanceTable());
  observer.observe(document.body, { childList: true, subtree: true });

  const onDragStart = (event: DragEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const handle = target.closest<HTMLElement>(`.${HANDLE_CLASS}`);
    const row = handle?.closest<HTMLElement>(ROW_SELECTOR);
    if (!handle || !row || !event.dataTransfer) return;

    draggedRow = row;
    row.classList.add("dragging");
    handle.setAttribute("aria-grabbed", "true");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(rowIndex(row)));
  };

  const onDragOver = (event: DragEvent) => {
    const target = event.target;
    if (!(target instanceof Element) || !draggedRow) return;
    const row = target.closest<HTMLElement>(ROW_SELECTOR);
    if (!row || row === draggedRow) return;

    event.preventDefault();
    clearDropIndicators();
    const rect = row.getBoundingClientRect();
    dropPosition = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
    row.classList.add(dropPosition === "before" ? DROP_BEFORE_CLASS : DROP_AFTER_CLASS);
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  };

  const onDrop = (event: DragEvent) => {
    const target = event.target;
    if (!(target instanceof Element) || !draggedRow) return;
    const targetRow = target.closest<HTMLElement>(ROW_SELECTOR);
    if (!targetRow || targetRow === draggedRow) return;

    event.preventDefault();
    const sourceIndex = rowIndex(draggedRow);
    const targetIndex = rowIndex(targetRow);
    if (sourceIndex >= 0 && targetIndex >= 0) {
      void persistReorder(sourceIndex, targetIndex, dropPosition);
    }
    finishDrag();
  };

  const onDragEnd = () => finishDrag();

  const onKeyDown = (event: KeyboardEvent) => {
    if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.classList.contains(HANDLE_CLASS)) return;

    const row = target.closest<HTMLElement>(ROW_SELECTOR);
    if (!row) return;
    const sourceIndex = rowIndex(row);
    const direction = event.key === "ArrowUp" ? -1 : 1;
    const targetIndex = sourceIndex + direction;
    if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= ruleRows().length) return;

    event.preventDefault();
    void persistReorder(sourceIndex, targetIndex, direction < 0 ? "before" : "after");
  };

  document.addEventListener("dragstart", onDragStart);
  document.addEventListener("dragover", onDragOver);
  document.addEventListener("drop", onDrop);
  document.addEventListener("dragend", onDragEnd);
  document.addEventListener("keydown", onKeyDown);

  return () => {
    observer.disconnect();
    document.removeEventListener("dragstart", onDragStart);
    document.removeEventListener("dragover", onDragOver);
    document.removeEventListener("drop", onDrop);
    document.removeEventListener("dragend", onDragEnd);
    document.removeEventListener("keydown", onKeyDown);
    finishDrag();
  };
}

function enhanceTable(): void {
  const header = document.querySelector<HTMLElement>(".group-table .table-header");
  if (header && !header.querySelector(".drag-heading")) {
    const heading = document.createElement("span");
    heading.className = "drag-heading";
    heading.setAttribute("aria-hidden", "true");
    header.prepend(heading);
  }

  for (const row of ruleRows()) {
    if (row.querySelector(`.${HANDLE_CLASS}`)) continue;
    const handle = document.createElement("button");
    handle.type = "button";
    handle.className = HANDLE_CLASS;
    handle.draggable = true;
    handle.textContent = "⠿";
    handle.title = "Drag to reorder. Alt + Arrow keys also work.";
    handle.setAttribute("aria-label", "Reorder group");
    handle.setAttribute("aria-grabbed", "false");
    row.prepend(handle);
  }

  const advancedButton = document.querySelector<HTMLButtonElement>("button.advanced");
  if (advancedButton && advancedButton.textContent !== ADVANCED_LABEL) {
    advancedButton.textContent = ADVANCED_LABEL;
  }
}

async function persistReorder(
  sourceIndex: number,
  targetIndex: number,
  position: "before" | "after",
): Promise<void> {
  const settings = await loadSettings();
  const nextRules = reorderRules(settings.rules, sourceIndex, targetIndex, position);
  if (!nextRules) return;

  await saveSettings({ ...settings, rules: nextRules });
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab?.windowId !== undefined) {
      await chrome.runtime.sendMessage({
        type: "reevaluate-window",
        windowId: activeTab.windowId,
      });
    }
  } catch {
    // Storage is already updated; the background sorter will catch up after restart.
  }
  window.setTimeout(() => window.location.reload(), 60);
}

function reorderRules(
  rules: readonly GroupingRule[],
  sourceIndex: number,
  targetIndex: number,
  position: "before" | "after",
): GroupingRule[] | undefined {
  const source = rules[sourceIndex];
  const target = rules[targetIndex];
  if (!source || !target || source.id === target.id) return undefined;

  const remaining = rules.filter((rule) => rule.id !== source.id);
  const remainingTargetIndex = remaining.findIndex((rule) => rule.id === target.id);
  if (remainingTargetIndex < 0) return undefined;

  const insertionIndex = remainingTargetIndex + (position === "after" ? 1 : 0);
  const next = [...remaining];
  next.splice(insertionIndex, 0, source);
  return next.map((rule, index) => ({ ...rule, priority: index }));
}

function ruleRows(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(ROW_SELECTOR)];
}

function rowIndex(row: HTMLElement): number {
  return ruleRows().indexOf(row);
}

function clearDropIndicators(): void {
  for (const row of ruleRows()) row.classList.remove(DROP_BEFORE_CLASS, DROP_AFTER_CLASS);
}

function finishDrag(): void {
  if (draggedRow) {
    draggedRow.classList.remove("dragging");
    draggedRow
      .querySelector<HTMLElement>(`.${HANDLE_CLASS}`)
      ?.setAttribute("aria-grabbed", "false");
  }
  draggedRow = undefined;
  clearDropIndicators();
}

function installStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .group-table .table-header,
    .group-table .rule-row {
      grid-template-columns: 30px 118px minmax(0, 1fr) 44px 34px !important;
    }

    .drag-heading,
    .${HANDLE_CLASS} {
      padding: 0 !important;
    }

    .${HANDLE_CLASS} {
      align-self: stretch;
      width: 30px;
      border: 0;
      border-radius: 0;
      background: transparent;
      color: #9aa0a6;
      cursor: grab;
      font-size: 17px;
      line-height: 1;
      touch-action: none;
    }

    .${HANDLE_CLASS}:hover,
    .${HANDLE_CLASS}:focus-visible {
      background: #303134;
      color: #e8eaed;
      outline: none;
    }

    .${HANDLE_CLASS}:active {
      cursor: grabbing;
    }

    .rule-row.dragging {
      opacity: 0.42;
    }

    .rule-row.${DROP_BEFORE_CLASS} {
      box-shadow: inset 0 2px 0 #8ab4f8;
    }

    .rule-row.${DROP_AFTER_CLASS} {
      box-shadow: inset 0 -2px 0 #8ab4f8;
    }
  `;
  document.head.append(style);
}
