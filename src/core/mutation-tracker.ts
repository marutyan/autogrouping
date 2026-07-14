import type { MutationKind, PendingMutation } from "./types";

export class MutationTracker {
  readonly #pending = new Map<number, PendingMutation[]>();

  constructor(private readonly now: () => number = Date.now) {}

  begin(
    tabId: number,
    kind: MutationKind,
    ttlMs = 3000,
    expectedGroupId?: number,
  ): PendingMutation {
    this.prune();
    const mutation: PendingMutation = {
      tabId,
      kind,
      operationId: crypto.randomUUID(),
      expiresAt: this.now() + ttlMs,
      ...(expectedGroupId === undefined ? {} : { expectedGroupId }),
    };
    const list = this.#pending.get(tabId) ?? [];
    list.push(mutation);
    this.#pending.set(tabId, list);
    return mutation;
  }

  consume(
    tabId: number,
    kind: MutationKind,
    observedGroupId?: number,
  ): PendingMutation | undefined {
    this.prune();
    const list = this.#pending.get(tabId);
    if (!list) return undefined;
    const index = list.findIndex(
      (mutation) =>
        mutation.kind === kind &&
        (mutation.expectedGroupId === undefined || mutation.expectedGroupId === observedGroupId),
    );
    if (index < 0) return undefined;
    const [mutation] = list.splice(index, 1);
    if (list.length === 0) this.#pending.delete(tabId);
    return mutation;
  }

  clear(tabId: number): void {
    this.#pending.delete(tabId);
  }

  prune(): void {
    const now = this.now();
    for (const [tabId, mutations] of this.#pending) {
      const active = mutations.filter((mutation) => mutation.expiresAt > now);
      if (active.length > 0) this.#pending.set(tabId, active);
      else this.#pending.delete(tabId);
    }
  }
}
