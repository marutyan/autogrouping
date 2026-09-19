import { describe, expect, it } from "vitest";
import {
  describePattern,
  inferScope,
  isSimplePattern,
  patternFromInput,
  patternToInput,
} from "../../src/core/pattern-input";

describe("patternFromInput", () => {
  it("converts keyword to site wildcard pattern", () => {
    expect(patternFromInput("github", "site")).toBe("github/*");
    expect(patternFromInput("Notion-app", "site")).toBe("notion-app/*");
  });

  it("converts URL or hostname with 'site' scope to host wildcard", () => {
    expect(patternFromInput("example.com", "site")).toBe("example.com/*");
    expect(patternFromInput("https://example.com/docs/api", "site")).toBe("example.com/*");
  });

  it("converts URL with 'path' scope to path prefix wildcard", () => {
    expect(patternFromInput("example.com/docs", "path")).toBe("example.com/docs*");
    expect(patternFromInput("https://example.com/docs/", "path")).toBe("example.com/docs*");
    expect(patternFromInput("https://example.com/", "path")).toBe("example.com/*");
  });

  it("converts URL with 'page' scope to exact page URL", () => {
    expect(patternFromInput("example.com/docs?id=1", "page")).toBe("example.com/docs?id=1");
    expect(patternFromInput("https://example.com/page", "page")).toBe("example.com/page");
  });

  it("returns undefined for invalid inputs or empty values", () => {
    expect(patternFromInput("", "site")).toBeUndefined();
    expect(patternFromInput("   ", "path")).toBeUndefined();
    expect(patternFromInput("ftp://example.com", "site")).toBeUndefined();
    expect(patternFromInput("https://", "site")).toBeUndefined();
  });
});

describe("isSimplePattern", () => {
  it("identifies simple patterns", () => {
    expect(isSimplePattern("github.com/*")).toBe(true);
    expect(isSimplePattern("github.com/docs*")).toBe(true);
    expect(isSimplePattern("github.com/docs/page")).toBe(true);
    expect(isSimplePattern("*://github.com/*")).toBe(true);
  });

  it("identifies non-simple patterns with wildcards in hostname or middle of path", () => {
    expect(isSimplePattern("*.github.com/*")).toBe(false);
    expect(isSimplePattern("github.com/*/issues")).toBe(false);
  });
});

describe("inferScope", () => {
  it("infers 'site' scope when ending with /*", () => {
    expect(inferScope("github.com/*")).toBe("site");
    expect(inferScope("*://github.com/*")).toBe("site");
  });

  it("infers 'path' scope when ending with * but not /*", () => {
    expect(inferScope("github.com/orgs*")).toBe("path");
  });

  it("infers 'page' scope when not ending with *", () => {
    expect(inferScope("github.com/orgs/repo")).toBe("page");
  });
});

describe("patternToInput", () => {
  it("formats 'site' scope pattern to hostname", () => {
    expect(patternToInput("github.com/*", "site")).toBe("github.com");
  });

  it("formats 'path' scope pattern to https URL without trailing asterisk", () => {
    expect(patternToInput("github.com/orgs*", "path")).toBe("https://github.com/orgs");
  });

  it("formats 'page' scope pattern to https URL", () => {
    expect(patternToInput("github.com/orgs/repo", "page")).toBe("https://github.com/orgs/repo");
  });
});

describe("describePattern", () => {
  it("describes Site keyword", () => {
    expect(describePattern("github/*")).toEqual({
      label: "github",
      scope: "Site keyword",
    });
  });

  it("describes Entire site", () => {
    expect(describePattern("github.com/*")).toEqual({
      label: "github.com",
      scope: "Entire site",
    });
    expect(describePattern("*://github.com/*")).toEqual({
      label: "github.com",
      scope: "Entire site",
    });
  });

  it("describes Exact host", () => {
    expect(describePattern("github.com")).toEqual({
      label: "github.com",
      scope: "Exact host",
    });
  });

  it("describes Custom pattern with wildcard in host and no path", () => {
    expect(describePattern("*.github.com")).toEqual({
      label: "*.github.com",
      scope: "Custom",
    });
  });

  it("describes wildcard path with ellipsis", () => {
    expect(describePattern("github.com/*/issues/*")).toEqual({
      label: "github.com",
      scope: "/…/issues/… path",
    });
    expect(describePattern("github.com/docs*")).toEqual({
      label: "github.com",
      scope: "/docs… path",
    });
  });

  it("describes Exact page", () => {
    expect(describePattern("github.com/pricing")).toEqual({
      label: "github.com",
      scope: "Exact page",
    });
  });
});
