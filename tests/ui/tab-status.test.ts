import { describe, expect, it } from "vitest";
import type { GroupingRule, TabStateRecord } from "../../src/core/types";
import { describeTabStatus, hostnameDetail } from "../../src/ui/tab-status";

function createRule(id: string, name: string, pattern: string): GroupingRule {
  return {
    id,
    name,
    color: "blue",
    patterns: [pattern],
    priority: 0,
    enabled: true,
    createdAt: 1000,
  };
}

describe("describeTabStatus", () => {
  const rules: GroupingRule[] = [createRule("r1", "GitHub", "github.com/*")];

  it("handles 'managed' state with known rule", () => {
    const state: TabStateRecord = {
      tabId: 1,
      state: "managed",
      managedRuleId: "r1",
      updatedAt: 1000,
    };
    const result = describeTabStatus(state, { url: "https://github.com/repo" }, rules);
    expect(result.title).toBe("Managed by GitHub");
    expect(result.detail).toBe("Matched target: github.com");
  });

  it("handles 'managed' state without known rule", () => {
    const state: TabStateRecord = {
      tabId: 1,
      state: "managed",
      updatedAt: 1000,
    };
    const result = describeTabStatus(state, { url: "https://unknown.com" }, rules);
    expect(result.title).toBe("Managed by AutoGrouping");
    expect(result.detail).toBeUndefined();
  });

  it("handles 'protected-external' state", () => {
    const state: TabStateRecord = {
      tabId: 1,
      state: "protected-external",
      updatedAt: 1000,
    };
    const result = describeTabStatus(state, { url: "https://example.com" }, rules);
    expect(result.title).toBe("In external group");
    expect(result.detail).toBe("External group ownership is preserved.");
  });

  it("handles 'protected-user' state", () => {
    const state: TabStateRecord = {
      tabId: 1,
      state: "protected-user",
      updatedAt: 1000,
    };
    const result = describeTabStatus(state, { url: "https://example.com" }, rules);
    expect(result.title).toBe("Protected manually");
    expect(result.detail).toBe("Use Return to automation to resume.");
  });

  it("handles 'protected-split-view' state", () => {
    const state: TabStateRecord = {
      tabId: 1,
      state: "protected-split-view",
      updatedAt: 1000,
    };
    const result = describeTabStatus(state, { url: "https://example.com" }, rules);
    expect(result.title).toBe("Protected by Split View");
    expect(result.detail).toBe("Grouping resumes after Split View ends.");
  });

  it("handles 'ignored-pinned' state", () => {
    const state: TabStateRecord = {
      tabId: 1,
      state: "ignored-pinned",
      updatedAt: 1000,
    };
    const result = describeTabStatus(state, { url: "https://example.com" }, rules);
    expect(result.title).toBe("Pinned and ignored");
    expect(result.detail).toBe("Pinned tabs remain in place.");
  });

  it("handles 'unmatched' state", () => {
    const state: TabStateRecord = {
      tabId: 1,
      state: "unmatched",
      updatedAt: 1000,
    };
    const result = describeTabStatus(state, { url: "https://example.com/page" }, rules);
    expect(result.title).toBe("No matching group");
    expect(result.detail).toBe("Hostname: example.com");
  });

  it("handles 'pending' state (fallback to default checking)", () => {
    const state: TabStateRecord = {
      tabId: 1,
      state: "pending",
      updatedAt: 1000,
    };
    const result = describeTabStatus(state, { url: "https://github.com/" }, rules);
    expect(result.title).toBe("Checking…");
    expect(result.detail).toBe("Potential match: GitHub");
  });

  it("handles undefined state (fallback to checking)", () => {
    const result = describeTabStatus(undefined, { url: "https://example.com" }, rules);
    expect(result.title).toBe("Checking…");
    expect(result.detail).toBe("Hostname: example.com");
  });
});

describe("hostnameDetail", () => {
  it("returns formatted hostname for valid URLs", () => {
    expect(hostnameDetail("https://example.org/path")).toBe("Hostname: example.org");
  });

  it("returns undefined for empty or invalid URLs", () => {
    expect(hostnameDetail(undefined)).toBeUndefined();
    expect(hostnameDetail("not-a-url")).toBeUndefined();
  });
});
