import { describe, expect, it, vi } from "vitest";
import { KeyedMutex, KeyedScheduler } from "../../src/core/scheduler";

describe("KeyedScheduler", () => {
  it("coalesces repeated work for one key", async () => {
    vi.useFakeTimers();
    const scheduler = new KeyedScheduler<number>();
    const calls: string[] = [];
    scheduler.schedule(1, 100, async () => { calls.push("first"); });
    scheduler.schedule(1, 100, async () => { calls.push("second"); });
    await vi.advanceTimersByTimeAsync(100);
    expect(calls).toEqual(["second"]);
    vi.useRealTimers();
  });
});

describe("KeyedMutex", () => {
  it("serializes tasks sharing a key", async () => {
    const mutex = new KeyedMutex<string>();
    const calls: string[] = [];
    let releaseFirst!: () => void;
    const gate = new Promise<void>((resolve) => { releaseFirst = resolve; });

    const first = mutex.run("window", async () => {
      calls.push("first:start");
      await gate;
      calls.push("first:end");
    });
    const second = mutex.run("window", async () => {
      calls.push("second");
    });

    await Promise.resolve();
    expect(calls).toEqual(["first:start"]);
    releaseFirst();
    await Promise.all([first, second]);
    expect(calls).toEqual(["first:start", "first:end", "second"]);
  });
});
