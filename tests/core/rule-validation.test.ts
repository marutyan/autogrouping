import { describe, expect, it } from "vitest";
import { validateSettings } from "../../src/core/rule-validation";
import type { GroupingRule } from "../../src/core/types";

const validRule: GroupingRule = {
  id: "a",
  name: "Rule A",
  color: "blue",
  patterns: ["a.com"],
  priority: 0,
  enabled: true,
  createdAt: 0,
};

describe("validateSettings", () => {
  it("keeps the valid rules and still reports the error when one rule is invalid", () => {
    const invalidRule = { id: "b", color: "blue", patterns: ["b.com"] }; // name required, missing
    const result = validateSettings({ rules: [validRule, invalidRule] });

    expect(result.value?.rules).toEqual([validRule]);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.ok).toBe(false);
  });

  it("returns ok:true with no errors when every rule is valid", () => {
    const result = validateSettings({ rules: [validRule] });

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.value?.rules).toEqual([validRule]);
  });
});
