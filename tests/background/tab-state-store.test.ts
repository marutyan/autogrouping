import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExtensionStorage } from "../../src/background/storage";
import { TabStateStore } from "../../src/background/tab-state-store";
import type { TabStateRecord } from "../../src/core/types";

describe("TabStateStore", () => {
  let sessionData: Record<string, unknown> = {};

  beforeEach(() => {
    sessionData = {};
    vi.stubGlobal("chrome", {
      storage: {
        session: {
          get: vi.fn(async (key: string) => ({ [key]: sessionData[key] })),
          set: vi.fn(async (items: Record<string, unknown>) => {
            Object.assign(sessionData, items);
          }),
        },
      },
    });
  });

  it("get は未登録タブに対して初期状態(pending)を返す", () => {
    const storage = new ExtensionStorage();
    const store = new TabStateStore(storage);

    const state = store.get(10);
    expect(state).toEqual({
      tabId: 10,
      state: "pending",
      updatedAt: expect.any(Number),
    });
  });

  it("apply は reduceTabState を適用して状態を更新し、storage.session へ永続化する", async () => {
    const storage = new ExtensionStorage();
    const store = new TabStateStore(storage);

    const now = 1700000000000;
    const result = await store.apply(1, { type: "user-protect", at: now });

    expect(result).toEqual({
      tabId: 1,
      state: "protected-user",
      updatedAt: now,
    });
    expect(store.get(1)).toEqual(result);

    // storage.session に保存されていることを確認
    const stored = (sessionData.tabStates as [number, TabStateRecord][]) ?? [];
    expect(stored).toEqual([[1, result]]);
  });

  it("load で storage.session から既存の状態を復元できる", async () => {
    const existing: [number, TabStateRecord][] = [
      [5, { tabId: 5, state: "protected-user", updatedAt: 1000 }],
    ];
    sessionData.tabStates = existing;

    const storage = new ExtensionStorage();
    const store = new TabStateStore(storage);
    await store.load();

    expect(store.get(5)).toEqual({
      tabId: 5,
      state: "protected-user",
      updatedAt: 1000,
    });
  });

  it("setInitial, remove, replace, prune が正しくメモリとストレージを更新する", async () => {
    const storage = new ExtensionStorage();
    const store = new TabStateStore(storage);

    // setInitial
    await store.setInitial(100);
    expect(store.get(100).state).toBe("pending");

    // apply
    await store.apply(100, { type: "rule-matched", ruleId: "r1", at: 2000 });
    expect(store.get(100).state).toBe("managed");

    // replace: 100 -> 200
    await store.replace(200, 100);
    expect(store.get(100).state).toBe("pending");
    expect(store.get(200)).toMatchObject({
      tabId: 200,
      state: "managed",
      managedRuleId: "r1",
    });

    // prune: liveTabIds にないものを削除
    await store.setInitial(300);
    await store.prune(new Set([200]));
    expect(store.get(300).state).toBe("pending");
    expect(store.get(200).state).toBe("managed");

    // remove
    await store.remove(200);
    expect(store.get(200).state).toBe("pending");
  });
});
