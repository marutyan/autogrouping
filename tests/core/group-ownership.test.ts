import { describe, expect, it } from "vitest";
import { findAdoptableGroupIds, reconcileOwnedGroups } from "../../src/core/group-ownership";
import type { GroupSnapshot } from "../../src/core/group-ownership";
import type { GroupingRule, OwnedGroup } from "../../src/core/types";

const rule = (id: string, overrides: Partial<GroupingRule> = {}): GroupingRule => ({
  id,
  name: `Rule ${id}`,
  color: "blue",
  patterns: ["a.com"],
  priority: 0,
  enabled: true,
  createdAt: 0,
  ...overrides,
});

const group = (overrides: Partial<GroupSnapshot> & { groupId: number }): GroupSnapshot => ({
  windowId: 1,
  title: "Rule a",
  color: "blue",
  tabs: [],
  ...overrides,
});

const matchingTab = { id: 1, url: "https://a.com", splitView: false };

describe("reconcileOwnedGroups", () => {
  it("keeps ownership for a previously-owned group even when none of its tabs match the rule anymore", () => {
    // 今回の主要バグの直接の再現ケース: ユーザーが手動で別サイトのタブを入れた、
    // またはグループ内タブが全て別サイトへ遷移した場合でも、既存の所有記録は落とさない。
    const previous = new Map<number, OwnedGroup>([
      [10, { groupId: 10, windowId: 1, ruleId: "a", createdAt: 0 }],
    ]);

    const owned = reconcileOwnedGroups({
      previous,
      groups: [
        group({ groupId: 10, tabs: [{ id: 1, url: "https://other.com", splitView: false }] }),
      ],
      rules: [rule("a")],
      knownOwnedRuleIds: new Set(["a"]),
      now: 100,
    });

    expect(owned.get(10)).toMatchObject({ groupId: 10, windowId: 1, ruleId: "a" });
  });

  it("adopts an unowned group even when not every tab matches the rule", () => {
    const owned = reconcileOwnedGroups({
      previous: new Map(),
      groups: [
        group({
          groupId: 10,
          tabs: [matchingTab, { id: 2, url: "https://other.com", splitView: false }],
        }),
      ],
      rules: [rule("a")],
      knownOwnedRuleIds: new Set(["a"]),
      now: 100,
    });

    expect(owned.get(10)).toMatchObject({ groupId: 10, windowId: 1, ruleId: "a" });
  });

  it("drops an ownership record whose group no longer exists", () => {
    const previous = new Map<number, OwnedGroup>([
      [5, { groupId: 5, windowId: 1, ruleId: "a", createdAt: 0 }],
    ]);

    const owned = reconcileOwnedGroups({
      previous,
      groups: [],
      rules: [rule("a")],
      knownOwnedRuleIds: new Set(["a"]),
      now: 100,
    });

    expect(owned.size).toBe(0);
  });

  it("drops an ownership record whose rule was deleted", () => {
    const previous = new Map<number, OwnedGroup>([
      [5, { groupId: 5, windowId: 1, ruleId: "gone", createdAt: 0 }],
    ]);

    const owned = reconcileOwnedGroups({
      previous,
      groups: [group({ groupId: 5, tabs: [matchingTab] })],
      rules: [],
      knownOwnedRuleIds: new Set(["gone"]),
      now: 100,
    });

    expect(owned.size).toBe(0);
  });

  it("updates windowId when an owned group moved to a different window", () => {
    const previous = new Map<number, OwnedGroup>([
      [7, { groupId: 7, windowId: 1, ruleId: "a", createdAt: 0 }],
    ]);

    const owned = reconcileOwnedGroups({
      previous,
      groups: [group({ groupId: 7, windowId: 2, tabs: [matchingTab] })],
      rules: [rule("a")],
      knownOwnedRuleIds: new Set(["a"]),
      now: 100,
    });

    expect(owned.get(7)).toMatchObject({ groupId: 7, windowId: 2, ruleId: "a" });
  });

  it("adopts every matching unowned group in the same window instead of merging them", () => {
    // 破壊的な統合はしない方針。同名グループが複数あれば全部所有し、
    // 収束は通常のURL評価に委ねる（controller.ts側の責務）。
    const owned = reconcileOwnedGroups({
      previous: new Map(),
      groups: [
        group({ groupId: 10, tabs: [matchingTab] }),
        group({ groupId: 20, tabs: [matchingTab] }),
      ],
      rules: [rule("a")],
      knownOwnedRuleIds: new Set(["a"]),
      now: 100,
    });

    expect([...owned.keys()].sort((a, b) => a - b)).toEqual([10, 20]);
  });

  it("does not adopt when the rule is not in knownOwnedRuleIds", () => {
    const owned = reconcileOwnedGroups({
      previous: new Map(),
      groups: [group({ groupId: 1, tabs: [matchingTab] })],
      rules: [rule("a")],
      knownOwnedRuleIds: new Set(), // 唯一の不成立条件
      now: 100,
    });

    expect(owned.size).toBe(0);
  });

  it("does not adopt when the group title does not match the rule name", () => {
    const owned = reconcileOwnedGroups({
      previous: new Map(),
      groups: [group({ groupId: 1, title: "Someone else's group", tabs: [matchingTab] })],
      rules: [rule("a")],
      knownOwnedRuleIds: new Set(["a"]),
      now: 100,
    });

    expect(owned.size).toBe(0);
  });

  it("does not adopt when the group color does not match the rule color", () => {
    const owned = reconcileOwnedGroups({
      previous: new Map(),
      groups: [group({ groupId: 1, color: "red", tabs: [matchingTab] })],
      rules: [rule("a")],
      knownOwnedRuleIds: new Set(["a"]),
      now: 100,
    });

    expect(owned.size).toBe(0);
  });

  it("does not adopt when no tab in the group matches the rule", () => {
    const owned = reconcileOwnedGroups({
      previous: new Map(),
      groups: [
        group({ groupId: 1, tabs: [{ id: 5, url: "https://other.com", splitView: false }] }),
      ],
      rules: [rule("a")],
      knownOwnedRuleIds: new Set(["a"]),
      now: 100,
    });

    expect(owned.size).toBe(0);
  });

  it("does not adopt an unowned group when two rules both satisfy the adoption conditions", () => {
    // 安全境界: 同じグループへ複数ルールが名乗り出た場合は曖昧なので、どちらにも渡さない。
    const ruleA = rule("a1", { name: "Rule a" });
    const ruleB = rule("a2", { name: "Rule a" });

    const owned = reconcileOwnedGroups({
      previous: new Map(),
      groups: [group({ groupId: 1, tabs: [matchingTab] })],
      rules: [ruleA, ruleB],
      knownOwnedRuleIds: new Set(["a1", "a2"]),
      now: 100,
    });

    expect(owned.size).toBe(0);
  });
});

describe("findAdoptableGroupIds", () => {
  it("finds the matching unowned group for a rule in a window", () => {
    const groupIds = findAdoptableGroupIds({
      groups: [group({ groupId: 1, tabs: [matchingTab] })],
      rule: rule("a"),
      windowId: 1,
      knownOwnedRuleIds: new Set(["a"]),
      ownedGroupIds: new Set(),
    });

    expect(groupIds).toEqual([1]);
  });

  it("returns every matching candidate in ascending groupId order regardless of input order", () => {
    const groupIds = findAdoptableGroupIds({
      groups: [
        group({ groupId: 30, tabs: [matchingTab] }),
        group({ groupId: 10, tabs: [matchingTab] }),
        group({ groupId: 20, tabs: [matchingTab] }),
      ],
      rule: rule("a"),
      windowId: 1,
      knownOwnedRuleIds: new Set(["a"]),
      ownedGroupIds: new Set(),
    });

    expect(groupIds).toEqual([10, 20, 30]);
  });

  it("ignores groups already owned", () => {
    const groupIds = findAdoptableGroupIds({
      groups: [group({ groupId: 1, tabs: [matchingTab] })],
      rule: rule("a"),
      windowId: 1,
      knownOwnedRuleIds: new Set(["a"]),
      ownedGroupIds: new Set([1]),
    });

    expect(groupIds).toEqual([]);
  });
});
