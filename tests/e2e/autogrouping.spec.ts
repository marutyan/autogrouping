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
  const tabId = await serviceWorker.evaluate(async () => {
    const tab = await chrome.tabs.create({ url: "https://example.com/", active: false });
    if (tab.id === undefined) throw new Error("Missing neutral tab id");
    return tab.id;
  });

  const externalGroupId = await serviceWorker.evaluate(async (currentTabId) => {
    const groupId = await chrome.tabs.group({ tabIds: [currentTabId] });
    await chrome.tabGroups.update(groupId, { title: "Claude", color: "red" });
    return groupId;
  }, tabId);

  await serviceWorker.evaluate(
    async (currentTabId) => chrome.tabs.update(currentTabId, { url: "https://github.com/openai" }),
    tabId,
  );

  await expect
    .poll(
      () => serviceWorker.evaluate(async (currentTabId) => chrome.tabs.get(currentTabId), tabId),
      { timeout: 8_000 },
    )
    .toMatchObject({ groupId: externalGroupId });

  await serviceWorker.evaluate(async (currentTabId) => chrome.tabs.ungroup(currentTabId), tabId);

  await expect
    .poll(
      async () => {
        const tab = await serviceWorker.evaluate(
          async (currentTabId) => chrome.tabs.get(currentTabId),
          tabId,
        );
        if (tab.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) return undefined;
        return serviceWorker.evaluate(async (groupId) => chrome.tabGroups.get(groupId), tab.groupId);
      },
      { timeout: 8_000 },
    )
    .toMatchObject({ title: "GitHub" });

  await serviceWorker.evaluate(
    async (currentTabId) =>
      chrome.tabs.update(currentTabId, { url: "https://example.com/unmatched" }),
    tabId,
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
});
