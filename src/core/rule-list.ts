import type { GroupingRule } from "./types";

// ルール配列の各ルールの優先順位（priority）を配列インデックスに合わせて0から再採番する。
// ルールの順序変更や削除によって生じた優先順位の歯抜けや不整合を正す純関数。
export function normalizePriorities(rules: readonly GroupingRule[]): GroupingRule[] {
  return rules.map((rule, index) => ({ ...rule, patterns: [...rule.patterns], priority: index }));
}

// 単一のルールオブジェクトのpatterns配列を含めて浅く複製する。
// 状態の不変性を保ち、元オブジェクトへの意図しない変更を防ぐために使う純関数。
export function cloneRule(rule: GroupingRule): GroupingRule {
  return { ...rule, patterns: [...rule.patterns] };
}

// 指定したIDのルールを別のルールの前または後に移動し、優先順位を再採番する。
// 並び替え操作の結果として新しい順序のルール配列を生成し、無効な移動はundefinedを返す。
export function moveRule(
  rules: readonly GroupingRule[],
  sourceRuleId: string,
  targetRuleId: string,
  position: "before" | "after",
): GroupingRule[] | undefined {
  if (sourceRuleId === targetRuleId) return undefined;
  const source = rules.find((rule) => rule.id === sourceRuleId);
  if (!source) return undefined;

  const remaining = rules.filter((rule) => rule.id !== sourceRuleId);
  const targetIndex = remaining.findIndex((rule) => rule.id === targetRuleId);
  if (targetIndex < 0) return undefined;

  const insertionIndex = targetIndex + (position === "after" ? 1 : 0);
  const next = [...remaining];
  next.splice(insertionIndex, 0, source);
  return normalizePriorities(next);
}

// 指定したルールをリストに追加または既存の同IDルールを置換し、優先順位を再採番する。
// ルール作成・更新時にリストの整合性を保ちながら新しい優先度を割り当てる純関数。
export function upsertRule(
  rules: readonly GroupingRule[],
  ruleToUpsert: GroupingRule,
): GroupingRule[] {
  const exists = rules.some((rule) => rule.id === ruleToUpsert.id);
  const next = exists
    ? rules.map((rule) => (rule.id === ruleToUpsert.id ? ruleToUpsert : rule))
    : [...rules, ruleToUpsert];
  return normalizePriorities(next);
}

// 指定したIDのルールをリストから削除し、残ったルールの優先順位を詰めて再採番する。
// ルール削除時に優先順位の歯抜けを防ぎ、順序を正常に保つ純関数。
export function removeRule(rules: readonly GroupingRule[], ruleId: string): GroupingRule[] {
  return normalizePriorities(rules.filter((rule) => rule.id !== ruleId));
}
