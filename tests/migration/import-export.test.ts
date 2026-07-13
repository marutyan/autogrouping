import { describe, expect, it } from "vitest";
import { previewImport } from "../../src/migration/import-export";

describe("previewImport", () => {
  it("converts legacy groupRules", () => {
    const preview = previewImport(
      JSON.stringify({
        groupRules: [
          {
            id: 4,
            name: "GitHub",
            color: "purple",
            pattern: "github.com/*\ngist.github.com/*",
            key: 2,
          },
        ],
      }),
    );

    expect(preview.source).toBe("legacy");
    expect(preview.errors).toEqual([]);
    expect(preview.settings?.rules[0]?.name).toBe("GitHub");
    expect(preview.settings?.rules[0]?.patterns).toEqual(["github.com/*", "gist.github.com/*"]);
    expect(preview.settings?.rules[0]?.priority).toBe(2);
  });

  it("rejects invalid JSON", () => {
    const preview = previewImport("{");
    expect(preview.source).toBe("unknown");
    expect(preview.errors.length).toBeGreaterThan(0);
  });
});
