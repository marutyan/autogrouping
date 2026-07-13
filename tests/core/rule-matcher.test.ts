import { describe, expect, it } from "vitest";
import { findMatchingRule, matchesPattern } from "../../src/core/rule-matcher";
import type { GroupingRule } from "../../src/core/types";

const rule = (overrides: Partial<GroupingRule>): GroupingRule => ({
  id: crypto.randomUUID(),
  name: "Rule",
  color: "blue",
  patterns: ["example.com/*"],
  priority: 0,
  enabled: true,
  createdAt: 1,
  ...overrides,
});

describe("matchesPattern", () => {
  it("matches host patterns without an explicit scheme", () => {
    expect(matchesPattern("https://example.com/path", "example.com/*")).toBe(true);
  });

  it("escapes regular expression characters", () => {
    expect(matchesPattern("https://example.com/a+b", "https://example.com/a+b")).toBe(true);
  });
});

describe("findMatchingRule", () => {
  it("uses priority before specificity", () => {
    const broad = rule({ id: "broad", priority: 0, patterns: ["example.com/*"] });
    const specific = rule({ id: "specific", priority: 1, patterns: ["example.com/docs/*"] });
    expect(findMatchingRule("https://example.com/docs/a", [specific, broad])?.id).toBe("broad");
  });

  it("uses specificity when priorities are equal", () => {
    const broad = rule({ id: "broad", patterns: ["example.com/*"] });
    const specific = rule({ id: "specific", patterns: ["example.com/docs/*"] });
    expect(findMatchingRule("https://example.com/docs/a", [broad, specific])?.id).toBe("specific");
  });
});
