import type { GroupingRule } from "./types";

const REGEX_SPECIAL = /[\\^$.*+?()[\]{}|]/g;

export function wildcardToRegExp(pattern: string): RegExp {
  const normalized = pattern.trim();
  const escaped = normalized.replace(REGEX_SPECIAL, "\\$&").replaceAll("\\*", ".*");
  return new RegExp(`^${escaped}$`, "i");
}

export function patternSpecificity(pattern: string): number {
  return pattern.replaceAll("*", "").length;
}

export function matchesPattern(url: string, pattern: string): boolean {
  if (!url || !pattern.trim()) return false;
  const normalizedPattern = pattern.includes("://") ? pattern : `*://${pattern}`;
  return wildcardToRegExp(normalizedPattern).test(url);
}

export function findMatchingRule(
  url: string,
  rules: readonly GroupingRule[],
): GroupingRule | undefined {
  const matches = rules
    .filter((rule) => rule.enabled)
    .flatMap((rule) =>
      rule.patterns
        .filter((pattern) => matchesPattern(url, pattern))
        .map((pattern) => ({ rule, specificity: patternSpecificity(pattern) })),
    )
    .sort((a, b) => {
      if (a.rule.priority !== b.rule.priority) return a.rule.priority - b.rule.priority;
      if (a.specificity !== b.specificity) return b.specificity - a.specificity;
      if (a.rule.createdAt !== b.rule.createdAt) return a.rule.createdAt - b.rule.createdAt;
      return a.rule.id.localeCompare(b.rule.id);
    });

  return matches[0]?.rule;
}
