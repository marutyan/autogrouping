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
  await expect(page.getByRole("button", { name: "Reorder GitHub" })).toBeVisible();
});

test("preserves external groups, resumes after exit, and removes unmatched tabs", async ({
  serviceWorker,
}) => {
  const result = await serviceWorker.evaluate(async () => {
    const waitFor = async <T>(
      read: () => Promise<T>,
      accept: (value: T) => boolean,
    ): Promise<T> => {
      const deadline = Date.now() + 8_000;
      while (Date.now() < deadline) {
        const value = await read();
        if (accept(value)) return value;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error("Timed out waiting for extension state");
    };

    const neutralTab = await chrome.tabs.create({ url: "https://example.com/", active: false });
    if (neutralTab.id === undefined) throw new Error("Missing neutral tab id");
    const externalGroupId = await chrome.tabs.group({ tabIds: [neutralTab.id] });
    await chrome.tabGroups.update(externalGroupId, { title: "Claude", color: "red" });
    await chrome.tabs.update(neutralTab.id, { url: "https://github.com/openai" });

    const externalTab = await waitFor(
      () => chrome.tabs.get(neutralTab.id as number),
      (tab) => tab.groupId === externalGroupId,
    );

    await chrome.tabs.ungroup(neutralTab.id);
    const managedTab = await waitFor(
      () => chrome.tabs.get(neutralTab.id as number),
      (tab) => tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE,
    );
    const managedGroup = await chrome.tabGroups.get(managedTab.groupId);

    await chrome.tabs.update(neutralTab.id, { url: "https://example.com/unmatched" });
    const unmatchedTab = await waitFor(
      () => chrome.tabs.get(neutralTab.id as number),
      (tab) => tab.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE,
    );

    return {
      externalPreserved: externalTab.groupId === externalGroupId,
      managedTitle: managedGroup.title,
      unmatchedGroupId: unmatchedTab.groupId,
    };
  });

  expect(result.externalPreserved).toBe(true);
  expect(result.managedTitle).toBe("GitHub");
  expect(result.unmatchedGroupId).toBe(-1);
});
