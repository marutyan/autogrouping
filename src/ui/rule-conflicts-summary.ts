import { findRuleConflicts } from "../core/rule-conflicts";
import { upsertRule } from "../core/rule-list";
import type { GroupingRule } from "../core/types";

// Mapの指定キーにSet要素を追加する内部ヘルパー。
// 同一ルールIDに対して複数の重複ルール名を重複なく収集するために使う。
function addMapValue(map: Map<string, Set<string>>, key: string, value: string): void {
  const values = map.get(key) ?? new Set<string>();
  values.add(value);
  map.set(key, values);
}

// 重複ルール名の配列を二重引用符で囲みカンマ区切り文字列に整形する。
// 重複警告UIでユーザーに競合先ルール名を読みやすく提示するために使う。
export function quotedNames(names: readonly string[]): string {
  return names.map((name) => `“${name}”`).join(", ");
}

// 全ルール間の重複関係を解析し、ルールIDごとに衝突している他のルール名一覧のMapを生成する。
// ルール一覧の各行に「Overlaps: ...」と競合警告を表示するために使う。
export function findConflictNamesByRule(rules: readonly GroupingRule[]): Map<string, Set<string>> {
  const conflicts = findRuleConflicts(rules);
  const names = new Map<string, Set<string>>();
  const ruleById = new Map(rules.map((rule) => [rule.id, rule]));
  for (const conflict of conflicts) {
    const firstName = ruleById.get(conflict.firstRuleId)?.name;
    const secondName = ruleById.get(conflict.secondRuleId)?.name;
    if (firstName && secondName) {
      addMapValue(names, conflict.firstRuleId, secondName);
      addMapValue(names, conflict.secondRuleId, firstName);
    }
  }
  return names;
}

// 編集中ドラフトルールと既存ルール群の間で重複する他のルール名一覧を抽出する。
// エディタ内で保存前に競合の有無をユーザーへ警告するために使う。
export function findDraftConflictNames(
  rules: readonly GroupingRule[],
  draft: GroupingRule | undefined,
): string[] {
  if (!draft) return [];
  const candidateRules = upsertRule(rules, draft);
  const names = new Set<string>();
  const ruleById = new Map(candidateRules.map((rule) => [rule.id, rule]));
  for (const conflict of findRuleConflicts(candidateRules)) {
    if (conflict.firstRuleId === draft.id) {
      const name = ruleById.get(conflict.secondRuleId)?.name;
      if (name) names.add(name);
    }
    if (conflict.secondRuleId === draft.id) {
      const name = ruleById.get(conflict.firstRuleId)?.name;
      if (name) names.add(name);
    }
  }
  return [...names];
}
