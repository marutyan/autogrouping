import type { ExtensionSettings, GroupingRule } from "../core/types";
import { DEFAULT_SETTINGS } from "../core/types";
import { validateRule, validateSettings } from "../core/rule-validation";

export interface ImportPreview {
  settings?: ExtensionSettings;
  errors: string[];
  warnings: string[];
  source: "autogrouping" | "legacy" | "unknown";
}

export function exportSettings(settings: ExtensionSettings): string {
  return JSON.stringify(
    {
      format: "autogrouping-settings",
      exportedAt: new Date().toISOString(),
      settings,
    },
    null,
    2,
  );
}

export function previewImport(text: string): ImportPreview {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { source: "unknown", errors: ["The selected file is not valid JSON."], warnings: [] };
  }

  if (typeof parsed === "object" && parsed !== null && "format" in parsed && "settings" in parsed) {
    const validation = validateSettings((parsed as { settings: unknown }).settings);
    return {
      source: "autogrouping",
      ...(validation.value ? { settings: validation.value } : {}),
      errors: validation.errors,
      warnings: [],
    };
  }

  const legacyRules = extractLegacyRules(parsed);
  if (legacyRules.length > 0) {
    const validationResults = legacyRules.map((rule, index) => validateRule(rule, index));
    const errors = validationResults.flatMap((result) => result.errors);
    const rules = validationResults.flatMap((result) => (result.value ? [result.value] : []));
    return {
      source: "legacy",
      settings: { ...DEFAULT_SETTINGS, rules },
      errors,
      warnings: ["Legacy rules were converted. Review names, patterns, colors, and priority before saving."],
    };
  }

  const direct = validateSettings(parsed);
  return {
    source: direct.value ? "autogrouping" : "unknown",
    ...(direct.value ? { settings: direct.value } : {}),
    errors: direct.errors,
    warnings: [],
  };
}

function extractLegacyRules(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (typeof parsed !== "object" || parsed === null) return [];
  const record = parsed as Record<string, unknown>;
  if (Array.isArray(record.groupRules)) return record.groupRules;
  if (record.groupRules && typeof record.groupRules === "object") return Object.values(record.groupRules);
  return [];
}

export function mergeRules(existing: GroupingRule[], incoming: GroupingRule[]): GroupingRule[] {
  const byId = new Map(existing.map((rule) => [rule.id, rule]));
  for (const rule of incoming) byId.set(rule.id, rule);
  return [...byId.values()].sort((a, b) => a.priority - b.priority || a.createdAt - b.createdAt);
}
