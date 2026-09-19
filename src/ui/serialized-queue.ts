// 直列に状態を更新しながら非同期タスクを順次実行するキュー。
// 前の非同期処理が完了した後の最新状態を次の更新処理へ確実に引き渡し、並行操作による状態上書きを防ぐために使うクラス。
export class SerializedQueue<T> {
  #current: T;
  #chain: Promise<void> = Promise.resolve();

  constructor(initialValue: T) {
    this.#current = initialValue;
  }

  getCurrent(): T {
    return this.#current;
  }

  setCurrent(value: T): void {
    this.#current = value;
  }

  enqueue<R>(task: (current: T) => Promise<{ next: T; result: R }>): Promise<R> {
    return new Promise<R>((resolve, reject) => {
      this.#chain = this.#chain
        .catch(() => undefined)
        .then(async () => {
          try {
            const { next, result } = await task(this.#current);
            this.#current = next;
            resolve(result);
          } catch (error) {
            reject(error);
          }
        });
    });
  }
}
