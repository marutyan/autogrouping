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
  }, settings);

  await page.setViewportSize(storeScreenshotSize);
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.addStyleTag({
    content: `
      html {
        min-height: 100%;
        background: #161719;
      }

      body {
        width: 720px;
        min-width: 720px;
        min-height: 800px;
        margin: 0 auto;
        overflow: hidden;
        border-right: 1px solid #3c4043;
        border-left: 1px solid #3c4043;
      }

      main {
        min-height: 800px;
        max-height: 800px;
      }
    `,
  });

  await expect(page.getByRole("button", { name: "Edit Research" })).toBeVisible();
  await expect(page.getByText("Overlaps: Engineering")).toBeVisible();

  await captureStoreScreenshot(page, "01-main-popup.png");

  await page.getByRole("button", { name: "Edit Research" }).click();
  const editor = page.locator(".editor");
  await expect(editor.getByRole("heading", { name: "Edit group" })).toBeVisible();
  await captureStoreScreenshot(page, "02-group-editor.png");

  await page.getByRole("button", { name: "Close group editor" }).click();
  const colorButton = page.getByRole("button", {
    name: "Change Research group color",
    exact: true,
  });
  const researchRow = page.locator(".rule-row").filter({ has: colorButton });
  await colorButton.click();
  await expect(researchRow.getByRole("listbox", { name: "Group color" })).toBeVisible();
  await captureStoreScreenshot(page, "03-inline-color-picker.png");
});

async function captureStoreScreenshot(page: Page, filename: string): Promise<void> {
  expect(page.viewportSize()).toEqual(storeScreenshotSize);
  await page.screenshot({
    path: path.join(screenshotDirectory, filename),
    animations: "disabled",
  });
}
