import { initialTabState, reduceTabState, type TabEvent } from "../core/state-machine";
import type { TabStateRecord } from "../core/types";
import type { ExtensionStorage } from "./storage";

/**
 * タブの状態（TabStateRecord）の保持と storage.session への永続化を担当するストア。
 * reduceTabState の適用を一元化し、状態の取得・更新・削除・置換を提供する。
 */
export class TabStateStore {
  readonly #storage: ExtensionStorage;
  readonly #tabStates = new Map<number, TabStateRecord>();

  constructor(storage: ExtensionStorage) {
    this.#storage = storage;
  }

  /**
   * storage.session に保存されているタブ状態を読み込み、メモリ上に復元する。
   */
  async load(): Promise<void> {
    const records = await this.#storage.getTabStates();
    this.#tabStates.clear();
    for (const [id, state] of records) {
      this.#tabStates.set(id, state);
    }
  }

  /**
   * 指定タブの現在の状態を取得する。未記録の場合は初期状態を返す。
   */
  get(tabId: number): TabStateRecord {
    return this.#tabStates.get(tabId) ?? initialTabState(tabId);
  }

  /**
   * 指定タブに状態遷移イベントを適用し、結果を永続化して返す。
   */
  async apply(tabId: number, event: TabEvent): Promise<TabStateRecord> {
    const current = this.get(tabId);
    const next = reduceTabState(current, event);
    this.#tabStates.set(tabId, next);
    await this.#persist();
    return next;
  }

  /**
   * 新規作成されたタブの初期状態を登録し、永続化する。
   */
  async setInitial(tabId: number): Promise<void> {
    this.#tabStates.set(tabId, initialTabState(tabId));
    await this.#persist();
  }

  /**
   * タブが閉じられたときにメモリと永続化から削除する。
   */
  async remove(tabId: number): Promise<void> {
    this.#tabStates.delete(tabId);
    await this.#persist();
  }

  /**
   * タブの置換（プリレンダリング等）に伴い、旧タブの状態を新タブIDへ引き継ぐ。
   */
  async replace(addedTabId: number, removedTabId: number): Promise<void> {
    const prior = this.#tabStates.get(removedTabId);
    this.#tabStates.delete(removedTabId);
    if (prior) {
      this.#tabStates.set(addedTabId, {
        ...prior,
        tabId: addedTabId,
        updatedAt: Date.now(),
      });
    }
    await this.#persist();
  }

  /**
   * 起動時に現在開かれているタブIDの集合と突き合わせ、閉じられたタブの記録を一括削除する。
   */
  async prune(liveTabIds: Set<number>): Promise<void> {
    let changed = false;
    for (const tabId of this.#tabStates.keys()) {
      if (!liveTabIds.has(tabId)) {
        this.#tabStates.delete(tabId);
        changed = true;
      }
    }
    if (changed) {
      await this.#persist();
    }
  }

  /**
   * 現在のタブ状態マップを storage.session へ保存する。
   */
  async #persist(): Promise<void> {
    await this.#storage.setTabStates(this.#tabStates);
  }
}
