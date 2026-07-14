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
  ],
};

test.beforeEach(async ({ serviceWorker }) => {
  await expect
    .poll(
      () =>
        serviceWorker.evaluate(async () => {
          const data = await chrome.storage.session.get("tabStates");
          return Array.isArray(data.tabStates);
        }),
      { timeout: 8_000 },
    )
    .toBe(true);

  await serviceWorker.evaluate(async (nextSettings) => {
    await chrome.storage.sync.set({ settings: nextSettings });
  }, settings);

  await new Promise((resolve) => setTimeout(resolve, 150));
});

test("preserves ownership when a matching tab moves between external groups", async ({
  serviceWorker,
}) => {
  const server = await startTestServer();
  const address = server.address() as AddressInfo;
  const matchingUrl = `http://github.localhost:${address.port}/openai`;

  try {
    const { targetTabId, anchorTabId } = await serviceWorker.evaluate(async () => {
      const targetTab = await chrome.tabs.create({ url: "chrome://newtab/", active: false });
      const anchorTab = await chrome.tabs.create({ url: "chrome://newtab/", active: false });
      if (targetTab.id === undefined || anchorTab.id === undefined) {
        throw new Error("Missing test tab id");
      }
      return { targetTabId: targetTab.id, anchorTabId: anchorTab.id };
    });

    const { firstGroupId, secondGroupId } = await serviceWorker.evaluate(
      async ({ currentTargetTabId, currentAnchorTabId }) => {
        const firstGroupId = await chrome.tabs.group({ tabIds: [currentTargetTabId] });
        await chrome.tabGroups.update(firstGroupId, { title: "Claude", color: "red" });

        const secondGroupId = await chrome.tabs.group({ tabIds: [currentAnchorTabId] });
        await chrome.tabGroups.update(secondGroupId, {
          title: "Browser Agent",
          color: "green",
        });

        return { firstGroupId, secondGroupId };
      },
      { currentTargetTabId: targetTabId, currentAnchorTabId: anchorTabId },
    );

    await serviceWorker.evaluate(
      async ({ currentTabId, url }) => chrome.tabs.update(currentTabId, { url }),
      { currentTabId: targetTabId, url: matchingUrl },
    );

    await expect
      .poll(
        async () => {
          const [tab, state] = await Promise.all([
            serviceWorker.evaluate(async (tabId) => chrome.tabs.get(tabId), targetTabId),
            readTabState(serviceWorker, targetTabId),
          ]);
          return { groupId: tab.groupId, state };
        },
        { timeout: 8_000 },
      )
      .toEqual({ groupId: firstGroupId, state: "protected-external" });

    await serviceWorker.evaluate(
      async ({ currentTabId, groupId }) => chrome.tabs.group({ tabIds: [currentTabId], groupId }),
      { currentTabId: targetTabId, groupId: secondGroupId },
    );

    await expect
      .poll(
        async () => {
          const [tab, state] = await Promise.all([
            serviceWorker.evaluate(async (tabId) => chrome.tabs.get(tabId), targetTabId),
            readTabState(serviceWorker, targetTabId),
          ]);
          return { groupId: tab.groupId, state };
        },
        { timeout: 8_000 },
      )
      .toEqual({ groupId: secondGroupId, state: "protected-external" });
  } finally {
    await closeServer(server);
  }
});

test("keeps explicit protection sticky until automation is restored", async ({ serviceWorker }) => {
  const server = await startTestServer();
  const address = server.address() as AddressInfo;
  const matchingUrl = `http://github.localhost:${address.port}/openai`;
  const unmatchedUrl = `http://example.localhost:${address.port}/unmatched`;

  try {
    const tabId = await serviceWorker.evaluate(async (url) => {
      const tab = await chrome.tabs.create({ url, active: false });
      if (tab.id === undefined) throw new Error("Missing test tab id");
      return tab.id;
    }, matchingUrl);

    await expect
      .poll(
        async () => {
          const [tab, state] = await Promise.all([
            serviceWorker.evaluate(async (currentTabId) => chrome.tabs.get(currentTabId), tabId),
            readTabState(serviceWorker, tabId),
          ]);
          return state === "managed" && tab.groupId !== -1;
        },
        { timeout: 8_000 },
      )
      .toBe(true);

    const managedTab = await serviceWorker.evaluate(
      async (currentTabId) => chrome.tabs.get(currentTabId),
      tabId,
    );
    if (managedTab.groupId === -1) throw new Error("Expected managed group");

    await serviceWorker.evaluate(
      async (currentTabId) =>
        chrome.runtime.sendMessage({ type: "protect-tab", tabId: currentTabId }),
      tabId,
    );

    await expect
      .poll(() => readTabState(serviceWorker, tabId), { timeout: 8_000 })
      .toBe("protected-user");

    await serviceWorker.evaluate(
      async ({ currentTabId, url }) => chrome.tabs.update(currentTabId, { url }),
      { currentTabId: tabId, url: unmatchedUrl },
    );

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
      .toEqual({ groupId: managedTab.groupId, state: "protected-user", url: unmatchedUrl });

    await serviceWorker.evaluate(
      async (currentTabId) =>
        chrome.runtime.sendMessage({ type: "return-tab", tabId: currentTabId }),
      tabId,
    );

    await expect
      .poll(
        async () => {
          const [tab, state] = await Promise.all([
            serviceWorker.evaluate(async (currentTabId) => chrome.tabs.get(currentTabId), tabId),
            readTabState(serviceWorker, tabId),
          ]);
          return { groupId: tab.groupId, state };
        },
        { timeout: 8_000 },
      )
      .toEqual({ groupId: -1, state: "unmatched" });
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
    response.end("<!doctype html><title>AutoGrouping protection E2E</title>");
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
