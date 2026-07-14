import type { ExtensionSettings, GroupColor, GroupingRule } from "./types";
import { DEFAULT_SETTINGS } from "./types";

const GROUP_COLORS = new Set<GroupColor>([
  "grey",
  "blue",
  "red",
  "yellow",
  "green",
  "pink",
  "purple",
  "cyan",
  "orange",
]);

export interface ValidationResult<T> {
  ok: boolean;
  value?: T;
  errors: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateRule(value: unknown, index = 0): ValidationResult<GroupingRule> {
  const errors: string[] = [];
  if (!isRecord(value)) return { ok: false, errors: [`rules[${index}] must be an object`] };

  const id =
    typeof value.id === "string" && value.id.trim() ? value.id.trim() : crypto.randomUUID();
  const name = typeof value.name === "string" ? value.name.trim() : "";
  if (!name) errors.push(`rules[${index}].name is required`);

  const color = value.color;
  if (typeof color !== "string" || !GROUP_COLORS.has(color as GroupColor)) {
    errors.push(`rules[${index}].color is invalid`);
  }

  const patterns = Array.isArray(value.patterns)
    ? value.patterns
        .filter((pattern): pattern is string => typeof pattern === "string")
        .map((pattern) => pattern.trim())
        .filter(Boolean)
    : typeof value.pattern === "string"
      ? value.pattern
          .split(/[\n ]+/)
          .map((pattern) => pattern.trim())
          .filter(Boolean)
      : [];
  if (patterns.length === 0)
    errors.push(`rules[${index}].patterns must contain at least one pattern`);

  const priority = Number.isInteger(value.priority)
    ? (value.priority as number)
    : Number.isInteger(value.key)
      ? (value.key as number)
      : index;
  const enabled = typeof value.enabled === "boolean" ? value.enabled : true;
  const createdAt = typeof value.createdAt === "number" ? value.createdAt : Date.now();

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      id,
      name,
      color: color as GroupColor,
      patterns,
      priority,
      enabled,
      createdAt,
    },
    errors: [],
  };
}

export function validateSettings(value: unknown): ValidationResult<ExtensionSettings> {
  if (!isRecord(value)) return { ok: false, errors: ["settings must be an object"] };
  const rawRules = Array.isArray(value.rules) ? value.rules : [];
  const ruleResults = rawRules.map((rule, index) => validateRule(rule, index));
  const errors = ruleResults.flatMap((result) => result.errors);
  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      enabled: typeof value.enabled === "boolean" ? value.enabled : DEFAULT_SETTINGS.enabled,
      newTabGracePeriodMs:
        typeof value.newTabGracePeriodMs === "number" && value.newTabGracePeriodMs >= 0
          ? value.newTabGracePeriodMs
          : DEFAULT_SETTINGS.newTabGracePeriodMs,
      splitViewSettleDelayMs:
        typeof value.splitViewSettleDelayMs === "number" && value.splitViewSettleDelayMs >= 0
          ? value.splitViewSettleDelayMs
          : DEFAULT_SETTINGS.splitViewSettleDelayMs,
      rules: ruleResults.flatMap((result) => (result.value ? [result.value] : [])),
      schemaVersion: 1,
    },
    errors: [],
  };
}
