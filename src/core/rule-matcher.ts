import type { GroupingRule } from "./types";

const REGEX_SPECIAL = /[\\^$.*+?()[\]{}|]/g;
const SITE_KEYWORD_PATTERN = /^([a-z0-9-]+)(?:\/\*)?$/i;

export interface MatchingRuleDetail {
  rule: GroupingRule;
  pattern: string;
  specificity: number;
}

export function wildcardToRegExp(pattern: string): RegExp {
  const normalized = pattern.trim();
  const escaped = normalized.replace(REGEX_SPECIAL, "\\$&").replaceAll("\\*", ".*");
  return new RegExp(`^${escaped}$`, "i");
}

export function patternSpecificity(pattern: string): number {
  return pattern.replaceAll("*", "").length;
}

export function matchesPattern(url: string, pattern: string): boolean {
  const normalizedPattern = pattern.trim();
  if (!url || !normalizedPattern) return false;

  const siteKeyword = normalizedPattern.match(SITE_KEYWORD_PATTERN)?.[1]?.toLowerCase();
  if (siteKeyword) {
    try {
      const hostnameLabels = new URL(url).hostname.toLowerCase().split(".");
      return hostnameLabels.includes(siteKeyword);
    } catch {
      return false;
    }
  }

  const wildcardPattern = normalizedPattern.includes("://")
    ? normalizedPattern
    : `*://${normalizedPattern}`;
  return wildcardToRegExp(wildcardPattern).test(url);
}

export function findMatchingRuleDetail(
  url: string,
  rules: readonly GroupingRule[],
): MatchingRuleDetail | undefined {
  return rules
    .filter((rule) => rule.enabled)
    .flatMap((rule) =>
      rule.patterns
        .filter((pattern) => matchesPattern(url, pattern))
        .map((pattern) => ({ rule, pattern, specificity: patternSpecificity(pattern) })),
    )
    .sort((a, b) => {
      if (a.rule.priority !== b.rule.priority) return a.rule.priority - b.rule.priority;
      if (a.specificity !== b.specificity) return b.specificity - a.specificity;
      if (a.rule.createdAt !== b.rule.createdAt) return a.rule.createdAt - b.rule.createdAt;
      return a.rule.id.localeCompare(b.rule.id);
    })[0];
}

export function findMatchingRule(
  url: string,
  rules: readonly GroupingRule[],
): GroupingRule | undefined {
  return findMatchingRuleDetail(url, rules)?.rule;
}
