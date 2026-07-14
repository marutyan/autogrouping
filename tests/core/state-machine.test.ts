import { describe, expect, it } from "vitest";
import { initialTabState, reduceTabState } from "../../src/core/state-machine";

describe("tab state machine", () => {
  it("returns an external-group tab to pending after it leaves the group", () => {
    const external = reduceTabState(initialTabState(1, 0), { type: "external-group", at: 1 });
    const left = reduceTabState(external, { type: "external-left", at: 2 });
    expect(left.state).toBe("pending");
  });

  it("marks a managed tab unmatched when its URL stops matching", () => {
    const managed = reduceTabState(initialTabState(1, 0), {
      type: "rule-matched",
      ruleId: "github",
      at: 1,
    });
    const unmatched = reduceTabState(managed, { type: "rule-unmatched", at: 2 });
    expect(unmatched.state).toBe("unmatched");
    expect(unmatched.managedRuleId).toBeUndefined();
  });

  it("keeps explicit user protection across rule events", () => {
    const protectedTab = reduceTabState(initialTabState(1, 0), { type: "user-protect", at: 1 });
    const result = reduceTabState(protectedTab, { type: "rule-matched", ruleId: "rule", at: 2 });
    expect(result.state).toBe("protected-user");
  });

  it("restores temporary external protection after leaving split view", () => {
    const external = reduceTabState(initialTabState(1, 0), { type: "external-group", at: 1 });
    const split = reduceTabState(external, { type: "split-entered", at: 2 });
    const restored = reduceTabState(split, { type: "split-left", at: 3 });
    expect(restored.state).toBe("protected-external");
  });

  it("allows an explicitly protected tab to return to automation", () => {
    const protectedTab = reduceTabState(initialTabState(1, 0), { type: "user-protect", at: 1 });
    const reset = reduceTabState(protectedTab, { type: "manual-reset", at: 2 });
    expect(reset.state).toBe("pending");
  });
});
