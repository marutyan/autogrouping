import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Worker } from "@playwright/test";
import { expect, test } from "./fixtures";

const settings = {
  enabled: true,
  newTabGracePeriodMs: 0,
  splitViewSettleDelayMs: 100,
  schemaVersion: 1 as const,
  rules: [
    {
      id: "github",
      name: "GitHub",
      color: "blue" as const,
      patterns: ["github/*"],
      priority: 0,
      enabled: true,
      createdAt: 1,
    },
    {
      id: "github-host",
      name: "GitHub Host",
      color: "purple" as const,
      patterns: ["github.com/*"],
      priority: 1,
      enabled: true,
      createdAt: 2,
    },
  ],
};

test.beforeEach(async ({ serviceWorker }) => {
  await serviceWorker.evaluate(async (nextSettings) => {
    await chrome.storage.sync.set({ settings: nextSettings });
  }, settings);
});

test("popup shows rule reasons, conflicts, and no separate settings page", async ({
  page,
  extensionId,
}) => {
  await page.goto(`chrome-extension://${extensionId}/popup.html`);

  await expect(page.getByText("Groups match from top to bottom")).toBeVisible();
  await expect(page.getByText("Overlaps: GitHub Host")).toBeVisible();
  await expect(page.getByRole("button", { name: /advanced settings/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reorder GitHub", exact: true })).toBeVisible();
});

test("preserves external groups, resumes after exit, and removes unmatched tabs", async ({
  serviceWorker,
}) => {
  const server = await startTestServer();
  const address = server.address() as AddressInfo;
  const matchingUrl = `http://github.localhost:${address.port}/openai`;
  const unmatchedUrl = `http://example.localhost:${address.port}/unmatched`;

  try {
    const tabId = await serviceWorker.evaluate(async () => {
      const tab = await chrome.tabs.create({ url: "chrome://newtab/", active: false });
      if (tab.id === undefined) throw new Error("Missing neutral tab id");
      return tab.id;
    });

    const externalGroupId = await serviceWorker.evaluate(async (currentTabId) => {
      const groupId = await chrome.tabs.group({ tabIds: [currentTabId] });
      await chrome.tabGroups.update(groupId, { title: "Claude", color: "red" });
      return groupId;
    }, tabId);

    await serviceWorker.evaluate(
      async ({ currentTabId, url }) => chrome.tabs.update(currentTabId, { url }),
      { currentTabId: tabId, url: matchingUrl },
    );

    await expect
      .poll(
        () => serviceWorker.evaluate(async (currentTabId) => chrome.tabs.get(currentTabId), tabId),
        { timeout: 8_000 },
      )
      .toMatchObject({ groupId: externalGroupId, url: matchingUrl });

    await expect
      .poll(() => readTabState(serviceWorker, tabId), { timeout: 8_000 })
      .toBe("protected-external");

    await serviceWorker.evaluate(async (currentTabId) => chrome.tabs.ungroup(currentTabId), tabId);

    await expect
      .poll(
        async () => {
          const [tab, state] = await Promise.all([
            serviceWorker.evaluate(async (currentTabId) => chrome.tabs.get(currentTabId), tabId),
            readTabState(serviceWorker, tabId),
          ]);
          return { groupId: tab.groupId, state, url: tab.url };
        },
        { timeout: 8_000 },
      )
      .toMatchObject({ state: "managed", url: matchingUrl });

    const managedTab = await serviceWorker.evaluate(
      async (currentTabId) => chrome.tabs.get(currentTabId),
      tabId,
    );
    const managedGroup = await serviceWorker.evaluate(
      async (groupId) => chrome.tabGroups.get(groupId),
      managedTab.groupId,
    );
    expect(managedGroup.title).toBe("GitHub");

    await serviceWorker.evaluate(
      async ({ currentTabId, url }) => chrome.tabs.update(currentTabId, { url }),
      { currentTabId: tabId, url: unmatchedUrl },
    );

    await expect
      .poll(
        async () => {
          const tab = await serviceWorker.evaluate(
            async (currentTabId) => chrome.tabs.get(currentTabId),
            tabId,
          );
          return tab.groupId;
        },
        { timeout: 8_000 },
      )
      .toBe(-1);
  } finally {
    await closeServer(server);
  }
});

async function readTabState(serviceWorker: Worker, tabId: number): Promise<string | undefined> {
  return serviceWorker.evaluate(async (currentTabId) => {
    const data = await chrome.storage.session.get("tabStates");
    const entries = Array.isArray(data.tabStates) ? data.tabStates : [];
    const entry = entries.find(
      (candidate): candidate is [number, { state?: string }] =>
        Array.isArray(candidate) && candidate[0] === currentTabId,
    );
    return entry?.[1]?.state;
  }, tabId);
}

async function startTestServer(): Promise<Server> {
  const server = createServer((_request, response) => {
    response.writeHead(200, {
      connection: "close",
      "content-type": "text/html; charset=utf-8",
    });
    response.end("<!doctype html><title>AutoGrouping E2E</title>");
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return server;
}

async function closeServer(server: Server): Promise<void> {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
