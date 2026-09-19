import { describe, expect, it } from "vitest";
import { formatRuleSummary, formatTabUrl } from "../../src/ui/rule-summary";

describe("formatTabUrl", () => {
  it("formats standard https URL as host and path without protocol", () => {
    expect(formatTabUrl("https://github.com/marutyan/repo/issues")).toBe(
      "github.com/marutyan/repo/issues",
    );
  });

  it("omits trailing root slash when path is empty or root", () => {
    expect(formatTabUrl("https://github.com/")).toBe("github.com");
    expect(formatTabUrl("https://github.com")).toBe("github.com");
  });

  it("preserves query parameters", () => {
    expect(formatTabUrl("https://github.com/search?q=tab")).toBe("github.com/search?q=tab");
  });

  it("returns empty string for undefined or empty url", () => {
    expect(formatTabUrl(undefined)).toBe("");
    expect(formatTabUrl("")).toBe("");
  });

  it("returns raw string if parsing fails", () => {
    expect(formatTabUrl("invalid-url")).toBe("invalid-url");
  });
});

describe("formatRuleSummary", () => {
  it("returns fallback text when patterns array is empty", () => {
    expect(formatRuleSummary([])).toBe("No target sites");
  });

  it("returns single label for single pattern", () => {
    expect(formatRuleSummary(["github/*"])).toBe("github");
  });

  it("joins up to 3 labels with comma", () => {
    expect(formatRuleSummary(["github/*", "arxiv.org/*", "notion.so/*"])).toBe(
      "github, arxiv.org, notion.so",
    );
  });

  it("appends +N more when patterns exceed 3 items", () => {
    expect(
      formatRuleSummary([
        "github/*",
        "arxiv.org/*",
        "notion.so/*",
        "google.com/*",
        "example.com/*",
      ]),
    ).toBe("github, arxiv.org, notion.so +2 more");
  });
});
