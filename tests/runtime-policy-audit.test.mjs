import { describe, expect, it } from "vitest";
import {
  auditRuntimeSources,
  findRuntimePolicyViolations,
} from "../scripts/runtime-policy-audit.mjs";

describe("runtime policy audit", () => {
  it("allows local Chrome API runtime code", () => {
    expect(
      findRuntimePolicyViolations(
        'const tabs = await chrome.tabs.query({ currentWindow: true });',
        "fixture.ts",
      ),
    ).toEqual([]);
  });

  it("reports network APIs with file and line information", () => {
    expect(
      findRuntimePolicyViolations('const payload = {};\nawait fetch("/telemetry", payload);', "fixture.ts"),
    ).toEqual([{ filePath: "fixture.ts", line: 2, rule: "network: fetch" }]);
  });

  it("reports dynamic code execution", () => {
    expect(findRuntimePolicyViolations('const run = new Function("return 1");', "fixture.ts")).toEqual([
      { filePath: "fixture.ts", line: 1, rule: "dynamic code: Function constructor" },
    ]);
  });

  it("reports remote dynamic imports", () => {
    expect(
      findRuntimePolicyViolations('await import("https://example.com/runtime.js");', "fixture.ts"),
    ).toEqual([{ filePath: "fixture.ts", line: 1, rule: "remote code: dynamic import" }]);
  });

  it("passes for the current runtime source tree", () => {
    expect(auditRuntimeSources()).toContain("wxt.config.ts");
  });
});
