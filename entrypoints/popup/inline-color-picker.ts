import type { GroupColor } from "../../src/core/types";
import { GROUP_COLORS, GROUP_COLOR_HEX } from "../../src/ui/group-colors";
import { loadSettings, saveSettings } from "../../src/ui/storage";

const STYLE_ID = "autogrouping-inline-color-picker-style";
const POPOVER_CLASS = "inline-color-popover";
const OPTION_CLASS = "inline-color-option";

let openPopover: HTMLDivElement | undefined;
let openTrigger: HTMLElement | undefined;

export function installInlineColorPicker(): () => void {
  installStyles();
  enhanceColorTriggers();

  const observer = new MutationObserver(() => enhanceColorTriggers());
  observer.observe(document.body, { childList: true, subtree: true });

  const onClick = (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const trigger = target.closest<HTMLElement>(".table-color");
    if (trigger) {
      event.preventDefault();
      event.stopPropagation();
      togglePicker(trigger);
      return;
    }

    if (!target.closest(`.${POPOVER_CLASS}`)) closePicker();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      const trigger = openTrigger;
      closePicker();
      trigger?.focus();
      return;
    }

    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.matches(".table-color")) return;
    if (event.key !== "Enter" && event.key !== " ") return;

    event.preventDefault();
    togglePicker(target);
  };

  document.addEventListener("click", onClick);
  document.addEventListener("keydown", onKeyDown);

  return () => {
    observer.disconnect();
    document.removeEventListener("click", onClick);
    document.removeEventListener("keydown", onKeyDown);
    closePicker();
  };
}

function enhanceColorTriggers(): void {
  for (const trigger of document.querySelectorAll<HTMLElement>(".table-color")) {
    trigger.setAttribute("role", "button");
    trigger.setAttribute("tabindex", "0");
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", String(trigger === openTrigger));
    trigger.setAttribute("title", "Change group color");
  }
}

function togglePicker(trigger: HTMLElement): void {
  if (openTrigger === trigger) {
    closePicker();
    return;
  }

  closePicker();
  openTrigger = trigger;
  trigger.setAttribute("aria-expanded", "true");

  const currentColor = colorFromTrigger(trigger);
  const popover = document.createElement("div");
  popover.className = POPOVER_CLASS;
  popover.setAttribute("role", "listbox");
  popover.setAttribute("aria-label", "Choose group color");

  for (const color of GROUP_COLORS) {
    const option = document.createElement("button");
    option.type = "button";
    option.className = color === currentColor ? `${OPTION_CLASS} selected` : OPTION_CLASS;
    option.style.backgroundColor = GROUP_COLOR_HEX[color];
    option.setAttribute("role", "option");
    option.setAttribute("aria-label", color);
    option.setAttribute("aria-selected", String(color === currentColor));
    option.title = color;
    option.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void selectColor(trigger, color);
    });
    popover.append(option);
  }

  document.body.append(popover);
  positionPopover(popover, trigger);
  openPopover = popover;

  const selected = popover.querySelector<HTMLButtonElement>(`.${OPTION_CLASS}.selected`);
  (selected ?? popover.querySelector<HTMLButtonElement>(`.${OPTION_CLASS}`))?.focus();
}

async function selectColor(trigger: HTMLElement, color: GroupColor): Promise<void> {
  const row = trigger.closest<HTMLElement>(".rule-row");
  if (!row) return;

  const rows = [...document.querySelectorAll<HTMLElement>(".rule-row")];
  const ruleIndex = rows.indexOf(row);
  if (ruleIndex < 0) return;

  const settings = await loadSettings();
  const rule = settings.rules[ruleIndex];
  if (!rule) return;

  const nextRules = settings.rules.map((candidate, index) =>
    index === ruleIndex ? { ...candidate, color } : candidate,
  );
  await saveSettings({ ...settings, rules: nextRules });

  trigger.style.backgroundColor = GROUP_COLOR_HEX[color];
  trigger.setAttribute("aria-label", `${color} group color`);
  closePicker();

  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (activeTab?.windowId !== undefined) {
    try {
      await chrome.runtime.sendMessage({
        type: "reevaluate-window",
        windowId: activeTab.windowId,
      });
    } catch {
      // The popup may outlive a service-worker restart; the saved color is still valid.
    }
  }

  window.setTimeout(() => window.location.reload(), 60);
}

function colorFromTrigger(trigger: HTMLElement): GroupColor | undefined {
  const label = trigger.getAttribute("aria-label")?.split(" ")[0];
  return GROUP_COLORS.find((color) => color === label);
}

function positionPopover(popover: HTMLDivElement, trigger: HTMLElement): void {
  const rect = trigger.getBoundingClientRect();
  const popoverWidth = 258;
  const left = Math.max(
    8,
    Math.min(window.innerWidth - popoverWidth - 8, rect.right - popoverWidth),
  );
  const top = Math.min(window.innerHeight - 52, rect.bottom + 6);
  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
}

function closePicker(): void {
  openPopover?.remove();
  openPopover = undefined;
  openTrigger?.setAttribute("aria-expanded", "false");
  openTrigger = undefined;
}

function installStyles(): void {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .table-color {
      width: 24px !important;
      height: 24px !important;
      border-radius: 5px !important;
      cursor: pointer;
      outline: none;
    }

    .table-color:hover,
    .table-color:focus-visible,
    .table-color[aria-expanded="true"] {
      border-color: #e8eaed !important;
      box-shadow: 0 0 0 2px rgb(138 180 248 / 30%);
      filter: brightness(1.12);
    }

    .${POPOVER_CLASS} {
      position: fixed;
      z-index: 1000;
      display: grid;
      grid-template-columns: repeat(9, 22px);
      gap: 5px;
      width: max-content;
      padding: 7px;
      border: 1px solid #5f6368;
      border-radius: 9px;
      background: #292a2d;
      box-shadow: 0 8px 24px rgb(0 0 0 / 45%);
    }

    .${OPTION_CLASS} {
      width: 22px;
      height: 22px;
      padding: 0;
      border: 2px solid transparent;
      border-radius: 5px;
      box-shadow: inset 0 0 0 1px rgb(255 255 255 / 24%);
    }

    .${OPTION_CLASS}:hover,
    .${OPTION_CLASS}:focus-visible {
      border-color: #bdc1c6;
      filter: brightness(1.12);
      outline: none;
    }

    .${OPTION_CLASS}.selected {
      border-color: #fff;
      box-shadow: inset 0 0 0 1px #202124, 0 0 0 1px #202124;
    }
  `;
  document.head.append(style);
}
