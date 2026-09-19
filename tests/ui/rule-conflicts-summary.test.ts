import { describe, expect, it } from "vitest";
import type { GroupingRule } from "../../src/core/types";
import {
  findConflictNamesByRule,
  findDraftConflictNames,
  quotedNames,
} from "../../src/ui/rule-conflicts-summary";

function createRule(id: string, name: string, patterns: string[]): GroupingRule {
  return {
    id,
    name,
    color: "blue",
    patterns,
    priority: 0,
    enabled: true,
    createdAt: 1000,
  };
}

describe("quotedNames", () => {
  it("formats names with smart double quotes and comma separation", () => {
    expect(quotedNames(["Alpha", "Beta"])).toBe("“Alpha”, “Beta”");
    expect(quotedNames([])).toBe("");
  });
});

describe("findConflictNamesByRule", () => {
  it("identifies conflicting rule names in both directions", () => {
    const rules = [
      createRule("r1", "GitHub All", ["github.com/*"]),
      createRule("r2", "GitHub Issues", ["github.com/issues*"]),
    ];
    const map = findConflictNamesByRule(rules);
    expect(map.get("r1")?.has("GitHub Issues")).toBe(true);
    expect(map.get("r2")?.has("GitHub All")).toBe(true);
  });
});

describe("findDraftConflictNames", () => {
  it("returns empty array when draft is undefined", () => {
    expect(findDraftConflictNames([], undefined)).toEqual([]);
  });

  it("identifies conflicts between draft and existing rules", () => {
    const rules = [createRule("r1", "GitHub All", ["github.com/*"])];
    const draft = createRule("r2", "GitHub Issues", ["github.com/issues*"]);
    expect(findDraftConflictNames(rules, draft)).toEqual(["GitHub All"]);
  });
});
