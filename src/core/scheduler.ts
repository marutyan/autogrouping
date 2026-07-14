export class KeyedScheduler<Key> {
  readonly #timers = new Map<Key, ReturnType<typeof setTimeout>>();
  readonly #chains = new Map<Key, Promise<void>>();

  schedule(key: Key, delayMs: number, task: () => Promise<void>): void {
    this.cancel(key);
    const timer = setTimeout(() => {
      this.#timers.delete(key);
      const previous = this.#chains.get(key) ?? Promise.resolve();
      const next = previous
        .catch(() => undefined)
        .then(task)
        .finally(() => {
          if (this.#chains.get(key) === next) this.#chains.delete(key);
        });
      this.#chains.set(key, next);
    }, delayMs);
    this.#timers.set(key, timer);
  }

  cancel(key: Key): void {
    const timer = this.#timers.get(key);
    if (timer) clearTimeout(timer);
    this.#timers.delete(key);
  }

  cancelAll(): void {
    for (const timer of this.#timers.values()) clearTimeout(timer);
    this.#timers.clear();
  }
}

export class KeyedMutex<Key> {
  readonly #tails = new Map<Key, Promise<void>>();

  async run<T>(key: Key, task: () => Promise<T>): Promise<T> {
    const previous = this.#tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => current);
    this.#tails.set(key, tail);
    await previous;
    try {
      return await task();
    } finally {
      release();
      if (this.#tails.get(key) === tail) this.#tails.delete(key);
    }
  }
}
