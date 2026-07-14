import { matchesPattern } from "./rule-matcher";
import type { GroupingRule } from "./types";

const SITE_KEYWORD_PATTERN = /^([a-z0-9-]+)(?:\/\*)?$/i;

export interface RuleConflict {
  firstRuleId: string;
  secondRuleId: string;
  firstPattern: string;
  secondPattern: string;
}

export function findRuleConflicts(rules: readonly GroupingRule[]): RuleConflict[] {
  const enabledRules = rules.filter((rule) => rule.enabled);
  const conflicts: RuleConflict[] = [];

  for (let firstIndex = 0; firstIndex < enabledRules.length; firstIndex += 1) {
    const firstRule = enabledRules[firstIndex];
    if (!firstRule) continue;

    for (let secondIndex = firstIndex + 1; secondIndex < enabledRules.length; secondIndex += 1) {
      const secondRule = enabledRules[secondIndex];
      if (!secondRule) continue;

      const conflict = firstConflict(firstRule, secondRule);
      if (conflict) conflicts.push(conflict);
    }
  }

  return conflicts;
}

function firstConflict(
  firstRule: GroupingRule,
  secondRule: GroupingRule,
): RuleConflict | undefined {
  for (const firstPattern of firstRule.patterns) {
    for (const secondPattern of secondRule.patterns) {
      if (!patternsOverlap(firstPattern, secondPattern)) continue;
      return {
        firstRuleId: firstRule.id,
        secondRuleId: secondRule.id,
        firstPattern,
        secondPattern,
      };
    }
  }
  return undefined;
}

function patternsOverlap(firstPattern: string, secondPattern: string): boolean {
  const first = firstPattern.trim();
  const second = secondPattern.trim();
  if (!first || !second) return false;
  if (first.toLowerCase() === second.toLowerCase()) return true;

  const firstSample = representativeUrl(first);
  const secondSample = representativeUrl(second);
  return (
    (firstSample !== undefined && matchesPattern(firstSample, second)) ||
    (secondSample !== undefined && matchesPattern(secondSample, first))
  );
}

function representativeUrl(pattern: string): string | undefined {
  const keyword = pattern.match(SITE_KEYWORD_PATTERN)?.[1]?.toLowerCase();
  if (keyword) return `https://${keyword}.com/`;

  const normalized = pattern.replace(/^\*:\/\//, "https://");
  const withScheme = normalized.includes("://") ? normalized : `https://${normalized}`;
  const sample = withScheme.replaceAll("*", "sample");
  try {
    return new URL(sample).toString();
  } catch {
    return undefined;
  }
}
