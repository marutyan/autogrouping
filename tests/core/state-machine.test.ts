import { describe, expect, it } from "vitest";
import { initialTabState, reduceTabState } from "../../src/core/state-machine";

describe("tab state machine", () => {
  it("keeps an externally protected tab protected across rule events", () => {
    const external = reduceTabState(initialTabState(1, 0), { type: "external-group", at: 1 });
    const result = reduceTabState(external, { type: "rule-matched", ruleId: "rule", at: 2 });
    expect(result.state).toBe("protected-external");
  });

  it("restores external protection after leaving split view", () => {
    const external = reduceTabState(initialTabState(1, 0), { type: "external-group", at: 1 });
    const split = reduceTabState(external, { type: "split-entered", at: 2 });
    const restored = reduceTabState(split, { type: "split-left", at: 3 });
    expect(restored.state).toBe("protected-external");
  });

  it("allows explicit manual reset", () => {
    const external = reduceTabState(initialTabState(1, 0), { type: "external-group", at: 1 });
    const reset = reduceTabState(external, { type: "manual-reset", at: 2 });
    expect(reset.state).toBe("pending");
  });
});
