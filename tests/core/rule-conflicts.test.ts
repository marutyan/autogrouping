import { describe, expect, it } from "vitest";
import { findRuleConflicts } from "../../src/core/rule-conflicts";
import type { GroupingRule } from "../../src/core/types";

const rule = (id: string, patterns: string[], priority: number): GroupingRule => ({
  id,
  name: id,
  color: "blue",
  patterns,
  priority,
  enabled: true,
  createdAt: priority,
});

describe("findRuleConflicts", () => {
  it("detects a site keyword overlapping a concrete hostname", () => {
    const conflicts = findRuleConflicts([
      rule("keyword", ["github/*"], 0),
      rule("host", ["github.com/*"], 1),
    ]);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ firstRuleId: "keyword", secondRuleId: "host" });
  });

  it("detects broad and narrow path patterns", () => {
    const conflicts = findRuleConflicts([
      rule("all-issues", ["github.com/*/issues/*"], 0),
      rule("repo-issues", ["github.com/openai/issues/*"], 1),
    ]);

    expect(conflicts).toHaveLength(1);
  });

  it("does not confuse hostname substrings with keyword labels", () => {
    const conflicts = findRuleConflicts([
      rule("github", ["github/*"], 0),
      rule("assets", ["githubusercontent.com/*"], 1),
    ]);

    expect(conflicts).toEqual([]);
  });
});
