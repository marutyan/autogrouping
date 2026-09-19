import { describe, expect, it } from "vitest";
import { SerializedQueue } from "../../src/ui/serialized-queue";

describe("SerializedQueue", () => {
  it("executes tasks sequentially and passes updated current value to the next task", async () => {
    const queue = new SerializedQueue<string[]>(["item1"]);

    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    const p1 = queue.enqueue(async (current) => {
      await delay(20);
      return { next: [...current, "item2"], result: "p1-done" };
    });

    const p2 = queue.enqueue(async (current) => {
      await delay(5);
      return { next: [...current, "item3"], result: "p2-done" };
    });

    const [r1, r2] = await Promise.all([p1, p2]);

    expect(r1).toBe("p1-done");
    expect(r2).toBe("p2-done");
    expect(queue.getCurrent()).toEqual(["item1", "item2", "item3"]);
  });

  it("handles double-toggle correctly so both changes are preserved", async () => {
    type RuleItem = { id: string; enabled: boolean };
    const queue = new SerializedQueue<RuleItem[]>([
      { id: "a", enabled: true },
      { id: "b", enabled: true },
    ]);

    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    // 同時に a と b の enabled を反転
    const toggleA = queue.enqueue(async (rules) => {
      await delay(15);
      const next = rules.map((r) => (r.id === "a" ? { ...r, enabled: !r.enabled } : r));
      return { next, result: false };
    });

    const toggleB = queue.enqueue(async (rules) => {
      await delay(5);
      const next = rules.map((r) => (r.id === "b" ? { ...r, enabled: !r.enabled } : r));
      return { next, result: false };
    });

    await Promise.all([toggleA, toggleB]);

    expect(queue.getCurrent()).toEqual([
      { id: "a", enabled: false },
      { id: "b", enabled: false },
    ]);
  });

  it("recovers and executes subsequent tasks when a preceding task fails", async () => {
    const queue = new SerializedQueue<number>(10);

    const failingTask = queue.enqueue(async () => {
      throw new Error("Task failed");
    });

    const succeedingTask = queue.enqueue(async (current) => {
      return { next: current + 5, result: "success" };
    });

    await expect(failingTask).rejects.toThrow("Task failed");
    const result = await succeedingTask;

    expect(result).toBe("success");
    expect(queue.getCurrent()).toBe(15);
  });
});
