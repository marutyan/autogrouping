import { describe, expect, it } from "vitest";
import { MutationTracker } from "../../src/core/mutation-tracker";

describe("MutationTracker", () => {
  it("consumes only a matching expected group", () => {
    let now = 100;
    const tracker = new MutationTracker(() => now);
    tracker.begin(1, "group", 1000, 7);
    expect(tracker.consume(1, "group", 8)).toBeUndefined();
    expect(tracker.consume(1, "group", 7)?.expectedGroupId).toBe(7);
    now += 1;
  });

  it("drops expired mutations", () => {
    let now = 100;
    const tracker = new MutationTracker(() => now);
    tracker.begin(1, "ungroup", 10, -1);
    now = 111;
    expect(tracker.consume(1, "ungroup", -1)).toBeUndefined();
  });
});
