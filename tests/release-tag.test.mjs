import { describe, expect, it } from "vitest";
import {
  expectedReleaseTag,
  readPackageVersion,
  verifyReleaseTag,
} from "../scripts/release-tag.mjs";

describe("release tag verification", () => {
  it("builds the expected tag from the package version", () => {
    expect(expectedReleaseTag("0.1.0")).toBe("v0.1.0");
  });

  it("accepts a tag that matches the package version", () => {
    expect(verifyReleaseTag("v0.1.0", "0.1.0")).toBe("v0.1.0");
  });

  it("rejects a mismatched tag", () => {
    expect(() => verifyReleaseTag("v0.2.0", "0.1.0")).toThrow(
      "Release tag v0.2.0 does not match package version 0.1.0 (expected v0.1.0).",
    );
  });

  it("rejects a missing tag", () => {
    expect(() => verifyReleaseTag("", "0.1.0")).toThrow(
      "Release tag <missing> does not match package version 0.1.0 (expected v0.1.0).",
    );
  });

  it("reads the current version from package.json", () => {
    expect(readPackageVersion()).toBe("0.1.0");
  });
});
