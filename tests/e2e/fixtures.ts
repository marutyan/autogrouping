import { chromium, test as base, type BrowserContext, type Worker } from "@playwright/test";
import path from "node:path";

export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
  serviceWorker: Worker;
}>({
  context: async ({ browserName: _browserName }, use) => {
    const extensionPath = path.join(process.cwd(), ".output/chrome-mv3");
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      headless: true,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });
    await use(context);
    await context.close();
  },
  serviceWorker: async ({ context }, use) => {
    let [serviceWorker] = context.serviceWorkers();
    serviceWorker ??= await context.waitForEvent("serviceworker");
    await use(serviceWorker);
  },
  extensionId: async ({ serviceWorker }, use) => {
    const extensionId = serviceWorker.url().split("/")[2];
    if (!extensionId) throw new Error("Unable to resolve extension id");
    await use(extensionId);
  },
});

export const expect = test.expect;
