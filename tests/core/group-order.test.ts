import { describe, expect, it } from "vitest";
import { orderedOwnedGroupIds } from "../../src/core/group-order";
import type { GroupingRule, OwnedGroup } from "../../src/core/types";

const rule = (id: string, priority: number, enabled = true): GroupingRule => ({
  id,
  name: id,
  color: "blue",
  patterns: [`${id}.com/*`],
  priority,
  enabled,
  createdAt: priority,
});

const group = (
  groupId: number,
  ruleId: string,
  windowId = 1,
  createdAt = groupId,
): OwnedGroup => ({
  windowId,
  groupId,
  ruleId,
  createdAt,
});

describe("orderedOwnedGroupIds", () => {
  it("orders managed groups by rule priority", () => {
    const rules = [rule("research", 0), rule("github", 1), rule("chat", 2)];
    const groups = [group(30, "chat"), group(10, "research"), group(20, "github")];

    expect(orderedOwnedGroupIds(groups, rules, 1)).toEqual([10, 20, 30]);
  });

  it("ignores other windows, disabled rules, and unknown external groups", () => {
    const rules = [rule("first", 0), rule("disabled", 1, false)];
    const groups = [
      group(1, "first"),
      group(2, "disabled"),
      group(3, "external"),
      group(4, "first", 2),
    ];

    expect(orderedOwnedGroupIds(groups, rules, 1)).toEqual([1]);
  });

  it("uses list order and creation order as deterministic tie breakers", () => {
    const rules = [rule("second", 0), rule("first", 0)];
    const groups = [group(4, "first", 1, 20), group(3, "second", 1, 10)];

    expect(orderedOwnedGroupIds(groups, rules, 1)).toEqual([3, 4]);
  });
});
