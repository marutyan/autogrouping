import { mkdirSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const settings = {
  enabled: true,
  newTabGracePeriodMs: 0,
  splitViewSettleDelayMs: 500,
  schemaVersion: 1 as const,
  rules: [
    {
      id: "research",
      name: "Research",
      color: "blue" as const,
      patterns: ["github/*", "arxiv.org/*"],
      priority: 0,
      enabled: true,
      createdAt: 1,
    },
    {
      id: "engineering",
      name: "Engineering",
      color: "purple" as const,
      patterns: ["github.com/*", "docs.github.com/*"],
      priority: 1,
      enabled: true,
      createdAt: 2,
    },
    {
      id: "planning",
      name: "Planning",
      color: "cyan" as const,
      patterns: ["notion.so/*", "calendar.google.com/*"],
      priority: 2,
      enabled: true,
      createdAt: 3,
    },
  ],
};

const screenshotDirectory = path.join(process.cwd(), "artifacts", "store-screenshots");
const storeScreenshotSize = { width: 1280, height: 800 } as const;

test("generates deterministic Chrome Web Store popup candidates", async ({
  page,
  serviceWorker,
  extensionId,
}) => {
  mkdirSync(screenshotDirectory, { recursive: true });

  await serviceWorker.evaluate(async (nextSettings) => {
    await chrome.storage.sync.set({ settings: nextSettings });
    await chrome.tabs.create({ url: "https://github.com/features/actions", active: false });
  }, settings);

  await page.setViewportSize(storeScreenshotSize);
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.addStyleTag({
    content: `
      html {
        min-height: 100%;
        background: #161719;
        display: flex;
        justify-content: center;
        align-items: center;
      }

      body {
        width: 400px;
        min-width: 400px;
        max-width: 400px;
        min-height: 600px;
        max-height: 600px;
        margin: 0 auto;
        overflow: hidden;
        border-radius: 12px;
        border: 1px solid #3c4043;
        box-shadow: 0 16px 32px rgba(0, 0, 0, 0.5);
      }

      main {
        min-height: 600px;
        max-height: 600px;
      }
    `,
  });

  await expect(page.getByRole("button", { name: "Edit Research" })).toBeVisible();
  await expect(page.getByText("Overlaps: Engineering")).toBeVisible();

  await captureStoreScreenshot(page, "01-main-popup.png");

  const sourceHandle = page.getByRole("button", { name: "Reorder Research", exact: true });
  const targetHandle = page.getByRole("button", { name: "Reorder Planning", exact: true });
  const sourceRow = page.locator(".rule-row").filter({ has: sourceHandle });
  const targetRow = page.locator(".rule-row").filter({ has: targetHandle });

  await page.evaluate(() => {
    const source = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Reorder Research"]',
    );
    if (!source) throw new Error("Missing drag source control");

    source.dispatchEvent(
      new DragEvent("dragstart", {
        bubbles: true,
        cancelable: true,
        dataTransfer: new DataTransfer(),
      }),
    );
  });
  await expect(sourceRow).toHaveClass(/dragging/);

  await page.evaluate(() => {
    const targetHandleElement = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Reorder Planning"]',
    );
    const target = targetHandleElement?.closest<HTMLElement>(".rule-row");
    if (!target) throw new Error("Missing drag target control");

    const targetRect = target.getBoundingClientRect();
    target.dispatchEvent(
      new DragEvent("dragover", {
        bubbles: true,
        cancelable: true,
        clientY: targetRect.top + 2,
        dataTransfer: new DataTransfer(),
      }),
    );
  });
  await expect(targetRow).toHaveClass(/drop-before/);
  await captureStoreScreenshot(page, "04-drag-reordering.png");

  await page.evaluate(() => {
    const source = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Reorder Research"]',
    );
    if (!source) throw new Error("Missing drag source control");
    source.dispatchEvent(new DragEvent("dragend", { bubbles: true, cancelable: true }));
  });
  await expect(sourceRow).not.toHaveClass(/dragging/);
  await expect(targetRow).not.toHaveClass(/drop-before/);

  const persistedOrder = await serviceWorker.evaluate(async () => {
    const result = await chrome.storage.sync.get("settings");
    const stored = result.settings as { rules?: Array<{ id?: string }> } | undefined;
    return stored?.rules?.map((rule) => rule.id) ?? [];
  });
  expect(persistedOrder).toEqual(["research", "engineering", "planning"]);

  await page.getByRole("button", { name: "Edit Research" }).click();
  const editor = page.locator(".editor");
  await expect(editor.getByRole("heading", { name: "Edit group" })).toBeVisible();
  await captureStoreScreenshot(page, "02-group-editor.png");

  await page.getByRole("button", { name: "Back to groups" }).click();
  const addSiteButton = page.getByRole("button", { name: "Add this site…" });
  await expect(addSiteButton).toBeVisible();
  await addSiteButton.click();
  await expect(page.getByRole("menu", { name: "Add this site" })).toBeVisible();
  await captureStoreScreenshot(page, "03-add-current-site.png");
});

async function captureStoreScreenshot(page: Page, filename: string): Promise<void> {
  expect(page.viewportSize()).toEqual(storeScreenshotSize);
  await page.screenshot({
    path: path.join(screenshotDirectory, filename),
    animations: "disabled",
  });
}
