import { isSplitViewTab } from "../browser/chrome-types";
import {
  findAdoptableGroupIds,
  reconcileOwnedGroups,
  type GroupSnapshot,
} from "../core/group-ownership";
import type { MutationTracker } from "../core/mutation-tracker";
import { TAB_GROUP_ID_NONE, type GroupingRule, type OwnedGroup } from "../core/types";
import type { ExtensionStorage } from "./storage";
import type { TabStateStore } from "./tab-state-store";

/**
 * 拡張機能が所有するChromeタブグループの追跡と整合、作成、所有権解放を担当するレジストリ。
 * storage.session の記録と実在グループを照合し、代表グループの決定やグループ引き取りを行う。
 */
export class OwnedGroupRegistry {
  readonly #storage: ExtensionStorage;
  readonly #mutations: MutationTracker;
  readonly #tabStates: TabStateStore;
  readonly #scheduleEvaluation: (tabId: number, delayMs: number) => void;
  readonly #ownedGroups = new Map<number, OwnedGroup>();

  constructor(
    storage: ExtensionStorage,
    mutations: MutationTracker,
    tabStates: TabStateStore,
    scheduleEvaluation: (tabId: number, delayMs: number) => void,
  ) {
    this.#storage = storage;
    this.#mutations = mutations;
    this.#tabStates = tabStates;
    this.#scheduleEvaluation = scheduleEvaluation;
  }

  /**
   * storage.session に保存されている所有グループの記録を読み込み、メモリ上に復元する。
   */
  async load(): Promise<void> {
    const groups = await this.#storage.getOwnedGroups();
    this.#ownedGroups.clear();
    for (const [id, group] of groups) {
      this.#ownedGroups.set(id, group);
    }
  }

  /**
   * 指定グループIDが拡張機能の所有グループか判定する。
   */
  has(groupId: number): boolean {
    return this.#ownedGroups.has(groupId);
  }

  /**
   * 指定グループIDの所有記録を取得する。
   */
  get(groupId: number): OwnedGroup | undefined {
    return this.#ownedGroups.get(groupId);
  }

  /**
   * chrome.tabGroups/tabs から純関数へ渡せる GroupSnapshot[] を組み立てる。
   * 起動時の所有権整合(#reconcileOwnership)と、新規作成前の引き取り確認(#findAdoptableGroupInWindow)の
   * 両方が使う共通の観測ロジック。
   */
  async buildGroupSnapshots(query: chrome.tabGroups.QueryInfo = {}): Promise<GroupSnapshot[]> {
    const groups = await chrome.tabGroups.query(query);
    const snapshots: GroupSnapshot[] = [];
    for (const group of groups) {
      const tabs = await chrome.tabs.query({ windowId: group.windowId, groupId: group.id });
      snapshots.push({
        groupId: group.id,
        windowId: group.windowId,
        title: group.title,
        color: group.color,
        tabs: tabs.map((tab) => ({
          // exactOptionalPropertyTypes下ではid/urlがundefinedのプロパティを持てないため、値がある時だけ含める。
          ...(tab.id === undefined ? {} : { id: tab.id }),
          ...(tab.url === undefined ? {} : { url: tab.url }),
          splitView: isSplitViewTab(tab),
        })),
      });
    }
    return snapshots;
  }

  /**
   * 永続化済みの所有記録(storage.session)を正として現在のグループ状態へ整合させる。
   * 推定で毎回作り直す(#ownedGroups.clear() してからルール一致で組み立て直す)設計はここで廃止し、
   * 実在しなくなった記録の削除、windowIdの追随、安全な条件を満たす未所有グループの引き取りだけを行う。
   * 同一(windowId, ruleId)の所有グループが複数残っても、ここで壊す（消す）処理はしない。
   * グループを消す操作は安全境界の外側なので作らず、通常のURL評価が一致タブを代表グループへ
   * 寄せることで自然に1つへ収束させる。
   */
  async reconcileOwnership(rules: GroupingRule[]): Promise<void> {
    const knownOwnedRuleIds = await this.#storage.getKnownOwnedRuleIds();
    const groups = await this.buildGroupSnapshots({});

    const owned = reconcileOwnedGroups({
      previous: this.#ownedGroups,
      groups,
      rules,
      knownOwnedRuleIds,
      now: Date.now(),
    });

    this.#ownedGroups.clear();
    for (const [groupId, record] of owned) this.#ownedGroups.set(groupId, record);
    await this.#persist();
  }

  /**
   * 指定ウィンドウのグループ観測結果を作り、その中に rule が安全に引き取れる未所有グループが
   * あるかを findAdoptableGroupIds（reconcileOwnedGroupsと共通の判定源）で確認する。
   * 複数候補があり得るが、この呼び出し元は1グループあれば足りるので先頭（groupId最小）を使う。
   */
  async findAdoptableGroupInWindow(
    windowId: number,
    rule: GroupingRule,
  ): Promise<number | undefined> {
    const groups = await this.buildGroupSnapshots({ windowId });
    const knownOwnedRuleIds = await this.#storage.getKnownOwnedRuleIds();
    return findAdoptableGroupIds({
      groups,
      rule,
      windowId,
      knownOwnedRuleIds,
      ownedGroupIds: new Set(this.#ownedGroups.keys()),
    })[0];
  }

  /**
   * 指定ルールに対応する代表所有グループを取得、または新規作成・引き取りを行う。
   */
  async getOrCreateOwnedGroup(
    windowId: number,
    tabId: number,
    rule: GroupingRule,
  ): Promise<{ group: OwnedGroup; createdWithTab: boolean }> {
    // 同一 (windowId, ruleId) の所有グループが複数残っていても壊さず全部保持する方針のため、
    // 代表選出は groupId 昇順で決定的に行う。先頭の記録が既に別ウィンドウへ移動済み、または
    // グループごと消滅していた場合はその記録だけ更新／削除して次の候補へ進む。ここで止まると、
    // 同ウィンドウに残っている有効な記録を見落として重複グループを新規作成してしまう。
    const candidates = [...this.#ownedGroups.values()]
      .filter((group) => group.windowId === windowId && group.ruleId === rule.id)
      .sort((a, b) => a.groupId - b.groupId);
    for (const candidate of candidates) {
      try {
        const browserGroup = await chrome.tabGroups.get(candidate.groupId);
        if (browserGroup.windowId !== candidate.windowId) {
          // グループが別ウィンドウへ移動済み。所有記録のwindowIdだけ実際の値へ追随させ、
          // 今回のタブには使わず次の候補へ進む。ここで採用すると chrome.tabs.group が
          // 別ウィンドウのタブをこのウィンドウのグループへ吸い込んでしまう。
          this.#ownedGroups.set(candidate.groupId, {
            ...candidate,
            windowId: browserGroup.windowId,
          });
          await this.#persist();
          continue;
        }
        if (browserGroup.title !== rule.name || browserGroup.color !== rule.color) {
          await chrome.tabGroups.update(candidate.groupId, {
            title: rule.name,
            color: rule.color,
          });
        }
        return { group: candidate, createdWithTab: false };
      } catch {
        this.#ownedGroups.delete(candidate.groupId);
      }
    }

    // 新規作成の前に、同ウィンドウに未所有だが引き取り可能な既存グループが無いか確認する。
    // 所有権を失った後の再評価で同名グループが重複して作られる不具合の根本対策。
    const adoptedGroupId = await this.findAdoptableGroupInWindow(windowId, rule);
    if (adoptedGroupId !== undefined) {
      const owned: OwnedGroup = {
        windowId,
        groupId: adoptedGroupId,
        ruleId: rule.id,
        createdAt: Date.now(),
      };
      this.#ownedGroups.set(adoptedGroupId, owned);
      await this.#persist();
      // 引き取ったグループの他のタブは protected-external のまま残っている。通常評価へ戻すことで、
      // 一致しないタブは外れ、同名グループが複数残っていれば一致タブが代表グループへ寄っていく。
      const tabsInGroup = await chrome.tabs.query({ windowId, groupId: adoptedGroupId });
      for (const groupedTab of tabsInGroup) {
        if (groupedTab.id !== undefined) this.#scheduleEvaluation(groupedTab.id, 0);
      }
      return { group: owned, createdWithTab: false };
    }

    this.#mutations.begin(tabId, "group", 3000);
    const groupId = await chrome.tabs.group({ tabIds: [tabId], createProperties: { windowId } });
    await chrome.tabGroups.update(groupId, { title: rule.name, color: rule.color });
    const owned: OwnedGroup = { windowId, groupId, ruleId: rule.id, createdAt: Date.now() };
    this.#ownedGroups.set(groupId, owned);
    await this.#storage.addKnownOwnedRuleId(rule.id);
    await this.#persist();
    return { group: owned, createdWithTab: true };
  }

  /**
   * ブラウザ側でタブグループが削除された際、所有権を解放し、保護されていた外部グループタブを再評価に戻す。
   */
  async handleGroupRemoved(group: chrome.tabGroups.TabGroup): Promise<void> {
    const ownedChanged = this.#ownedGroups.delete(group.id);
    if (ownedChanged) await this.#persist();

    const tabs = await chrome.tabs.query({ windowId: group.windowId });
    for (const tab of tabs) {
      if (tab.id === undefined) continue;
      const current = this.#tabStates.get(tab.id);
      if (current.state !== "protected-external") continue;
      if (
        tab.groupId !== undefined &&
        tab.groupId !== TAB_GROUP_ID_NONE &&
        !this.#ownedGroups.has(tab.groupId)
      ) {
        continue;
      }

      await this.#tabStates.apply(tab.id, { type: "external-left", at: Date.now() });
      this.#scheduleEvaluation(tab.id, 0);
    }
  }

  /**
   * 所有グループの名前や色が変更された際、ルールと合致しなくなっていれば所有権を解放しタブを保護する。
   */
  async handleOwnedGroupMetadataChange(
    group: chrome.tabGroups.TabGroup,
    rules: GroupingRule[],
  ): Promise<void> {
    const owned = this.#ownedGroups.get(group.id);
    if (!owned) return;
    const rule = rules.find((candidate) => candidate.id === owned.ruleId);
    if (rule && group.title === rule.name && group.color === rule.color) return;

    this.#ownedGroups.delete(group.id);
    await this.#persist();
    const tabs = await chrome.tabs.query({ windowId: group.windowId, groupId: group.id });
    await Promise.all(
      tabs.flatMap((tab) =>
        tab.id === undefined
          ? []
          : [this.#tabStates.apply(tab.id, { type: "external-group", at: Date.now() })],
      ),
    );
  }

  /**
   * 現在の所有グループマップを storage.session へ保存する。
   */
  async #persist(): Promise<void> {
    await this.#storage.setOwnedGroups(this.#ownedGroups);
  }
}
