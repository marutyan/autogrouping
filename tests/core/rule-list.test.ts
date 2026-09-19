import { describe, expect, it } from "vitest";
import {
  addPatternToRule,
  cloneRule,
  moveRule,
  normalizePriorities,
  removeRule,
  upsertRule,
} from "../../src/core/rule-list";
import type { GroupingRule } from "../../src/core/types";

function createRule(id: string, name: string, priority = 0): GroupingRule {
  return {
    id,
    name,
    color: "blue",
    patterns: [`${id}.com/*`],
    priority,
    enabled: true,
    createdAt: 1000,
  };
}

describe("normalizePriorities", () => {
  it("re-indexes priorities starting from 0 sequentially", () => {
    const rules: GroupingRule[] = [
      createRule("a", "Rule A", 5),
      createRule("b", "Rule B", 99),
      createRule("c", "Rule C", 1),
    ];
    const normalized = normalizePriorities(rules);
    expect(normalized.map((r) => r.priority)).toEqual([0, 1, 2]);
    expect(normalized.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });
});

describe("cloneRule", () => {
  it("creates a shallow copy with a new patterns array", () => {
    const original = createRule("a", "Rule A");
    const cloned = cloneRule(original);
    expect(cloned).toEqual(original);
    expect(cloned).not.toBe(original);
    expect(cloned.patterns).not.toBe(original.patterns);
  });
});

describe("moveRule", () => {
  const rules = [
    createRule("a", "Rule A", 0),
    createRule("b", "Rule B", 1),
    createRule("c", "Rule C", 2),
    createRule("d", "Rule D", 3),
  ];

  it("moves rule to before target", () => {
    // c を b の前へ (b, c, d -> c, b, d)
    const result = moveRule(rules, "c", "b", "before");
    expect(result?.map((r) => r.id)).toEqual(["a", "c", "b", "d"]);
    expect(result?.map((r) => r.priority)).toEqual([0, 1, 2, 3]);
  });

  it("moves rule to after target", () => {
    // b を c の後へ (b, c, d -> c, b, d)
    const result = moveRule(rules, "b", "c", "after");
    expect(result?.map((r) => r.id)).toEqual(["a", "c", "b", "d"]);
    expect(result?.map((r) => r.priority)).toEqual([0, 1, 2, 3]);
  });

  it("moves rule to the beginning (before first element)", () => {
    // d を 先頭 a の前へ
    const result = moveRule(rules, "d", "a", "before");
    expect(result?.map((r) => r.id)).toEqual(["d", "a", "b", "c"]);
    expect(result?.map((r) => r.priority)).toEqual([0, 1, 2, 3]);
  });

  it("moves rule to the end (after last element)", () => {
    // a を 末尾 d の後へ
    const result = moveRule(rules, "a", "d", "after");
    expect(result?.map((r) => r.id)).toEqual(["b", "c", "d", "a"]);
    expect(result?.map((r) => r.priority)).toEqual([0, 1, 2, 3]);
  });

  it("returns undefined if source and target are the same", () => {
    expect(moveRule(rules, "a", "a", "before")).toBeUndefined();
  });

  it("returns undefined if source or target does not exist", () => {
    expect(moveRule(rules, "x", "a", "before")).toBeUndefined();
    expect(moveRule(rules, "a", "x", "before")).toBeUndefined();
  });
});

describe("upsertRule", () => {
  it("appends new rule to the end and normalizes priorities", () => {
    const rules = [createRule("a", "Rule A", 0), createRule("b", "Rule B", 1)];
    const newRule = createRule("c", "Rule C", 0);
    const result = upsertRule(rules, newRule);
    expect(result.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(result.map((r) => r.priority)).toEqual([0, 1, 2]);
  });

  it("replaces existing rule in place and preserves normalized priorities", () => {
    const rules = [
      createRule("a", "Rule A", 0),
      createRule("b", "Rule B", 1),
      createRule("c", "Rule C", 2),
    ];
    const target = rules[1];
    if (!target) throw new Error("Expected rule at index 1");
    const updatedRule = { ...target, name: "Updated B" };
    const result = upsertRule(rules, updatedRule);
    expect(result.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(result[1]?.name).toBe("Updated B");
    expect(result.map((r) => r.priority)).toEqual([0, 1, 2]);
  });
});

describe("removeRule", () => {
  it("removes rule by id and normalizes priorities", () => {
    const rules = [
      createRule("a", "Rule A", 0),
      createRule("b", "Rule B", 1),
      createRule("c", "Rule C", 2),
    ];
    const result = removeRule(rules, "b");
    expect(result.map((r) => r.id)).toEqual(["a", "c"]);
    expect(result.map((r) => r.priority)).toEqual([0, 1]);
  });

  it("returns normalized rules when rule id is not found", () => {
    const rules = [createRule("a", "Rule A", 5)];
    const result = removeRule(rules, "nonexistent");
    expect(result.map((r) => r.id)).toEqual(["a"]);
    expect(result[0]?.priority).toBe(0);
  });
});

describe("addPatternToRule", () => {
  it("adds pattern to target rule when not already present", () => {
    const rules = [createRule("a", "Rule A", 0), createRule("b", "Rule B", 1)];
    const result = addPatternToRule(rules, "a", "example.com/*");
    expect(result[0]?.patterns).toEqual(["a.com/*", "example.com/*"]);
    expect(result[1]?.patterns).toEqual(["b.com/*"]);
  });

  it("returns same array contents if pattern is already included in target rule", () => {
    const rules = [createRule("a", "Rule A", 0)];
    const result = addPatternToRule(rules, "a", "a.com/*");
    expect(result).toEqual(rules);
    expect(result[0]?.patterns).toEqual(["a.com/*"]);
  });

  it("returns same array contents if rule id is not found", () => {
    const rules = [createRule("a", "Rule A", 0)];
    const result = addPatternToRule(rules, "nonexistent", "example.com/*");
    expect(result).toEqual(rules);
  });
});
