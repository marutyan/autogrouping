import { findMatchingRule } from "./rule-matcher";
import type { GroupColor, GroupingRule, OwnedGroup } from "./types";

/**
 * Chromeの `tabGroups`/`tabs` APIから取得した1グループ分の観測結果。
 * `chrome` に依存しない純関数へ渡すため、API型から必要な値だけを切り出した形。
 */
export interface GroupSnapshot {
  groupId: number;
  windowId: number;
  title: string | undefined;
  color: GroupColor;
  tabs: readonly { id?: number; url?: string; splitView: boolean }[];
}

/**
 * 未所有グループが「AutoGroupingが過去に作った、この rule のグループ」と判断できるかを1グループごとに判定する。
 * title・color・knownOwnedRuleIds・一致タブ1件以上のすべてを満たさない限り引き取らない
 * （ユーザーや他拡張が作ったグループを奪わないための安全境界）。
 */
function isAdoptableGroup(
  group: GroupSnapshot,
  rule: GroupingRule,
  knownOwnedRuleIds: ReadonlySet<string>,
): boolean {
  if (!rule.enabled || !knownOwnedRuleIds.has(rule.id)) return false;
  if (group.title !== rule.name || group.color !== rule.color) return false;
  if (group.tabs.length === 0 || group.tabs.some((tab) => tab.splitView)) return false;
  return group.tabs.some((tab) => Boolean(tab.url && findMatchingRule(tab.url, [rule])));
}

/**
 * 指定した1ルール・1ウィンドウについて、引き取り可能な未所有グループを全て探す。
 * #getOrCreateOwnedGroup（新規グループ作成前の確認）が使う。引き取り可否そのものの判定は
 * isAdoptableGroup が単一の情報源で、ここはそれをwindowId・所有済み除外で絞り込むだけ。
 * 同名グループが複数あっても全部を引き取り対象として返す（groupId昇順、決定的）。
 * 破壊的な統合はしない方針のため、複数を1つへ絞る判断はここでは行わない。
 */
export function findAdoptableGroupIds(args: {
  groups: readonly GroupSnapshot[];
  rule: GroupingRule;
  windowId: number;
  knownOwnedRuleIds: ReadonlySet<string>;
  ownedGroupIds: ReadonlySet<number>;
}): number[] {
  const { groups, rule, windowId, knownOwnedRuleIds, ownedGroupIds } = args;
  return groups
    .filter((group) => group.windowId === windowId && !ownedGroupIds.has(group.groupId))
    .filter((group) => isAdoptableGroup(group, rule, knownOwnedRuleIds))
    .map((group) => group.groupId)
    .sort((a, b) => a - b);
}

/**
 * service worker起動時に、永続化済みの所有記録（previous）を正として現在のグループ状態（groups）へ整合させる。
 * 実在しなくなった記録・ルールが削除された記録を落とし、windowId を実際の値へ更新し、
 * 未所有グループのうち安全に引き取れるものだけを新たに所有へ加える。
 * 推定で作り直す（毎回clearする）設計はここで廃止している。
 * 同一 (windowId, ruleId) の所有グループが複数になっても、破壊的な統合はここでは行わない
 * （グループを消す操作は安全境界の外側なので作らない。通常のURL評価が一致タブを代表グループへ
 * 寄せることで自然に収束させる方針）。
 */
export function reconcileOwnedGroups(args: {
  previous: ReadonlyMap<number, OwnedGroup>;
  groups: readonly GroupSnapshot[];
  rules: readonly GroupingRule[];
  knownOwnedRuleIds: ReadonlySet<string>;
  now: number;
}): Map<number, OwnedGroup> {
  const { previous, groups, rules, knownOwnedRuleIds, now } = args;
  const snapshotById = new Map(groups.map((group) => [group.groupId, group]));
  const ruleById = new Map(rules.map((rule) => [rule.id, rule]));

  // 1. 既存の所有記録を正として保持する。実在しないグループ、ルールが削除された記録は落とし、
  //    windowId だけ実際の観測値へ更新する（グループを別ウィンドウへ移した場合に対応するため）。
  const owned = new Map<number, OwnedGroup>();
  for (const [groupId, record] of [...previous.entries()].sort((a, b) => a[0] - b[0])) {
    const snapshot = snapshotById.get(groupId);
    if (!snapshot || !ruleById.has(record.ruleId)) continue;
    owned.set(groupId, { ...record, windowId: snapshot.windowId });
  }

  // 2. 未所有グループの引き取り。グループを1周し、そのグループを引き取れるルールが
  //    ちょうど1つのときだけ採用する（複数ルールが同時に条件を満たす場合は曖昧なので採用しない）。
  for (const snapshot of groups) {
    if (owned.has(snapshot.groupId)) continue;
    const adoptingRules = rules.filter((rule) =>
      isAdoptableGroup(snapshot, rule, knownOwnedRuleIds),
    );
    const rule = adoptingRules[0];
    if (adoptingRules.length !== 1 || !rule) continue;
    owned.set(snapshot.groupId, {
      windowId: snapshot.windowId,
      groupId: snapshot.groupId,
      ruleId: rule.id,
      createdAt: now,
    });
  }

  return owned;
}
