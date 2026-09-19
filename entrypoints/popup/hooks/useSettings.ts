import { useEffect, useState } from "react";
import { normalizePriorities } from "../../../src/core/rule-list";
import { validateSettings } from "../../../src/core/rule-validation";
import type { GroupingRule } from "../../../src/core/types";
import { loadSettings, saveSettings } from "../../../src/storage/settings-repository";
import { reevaluateWindow } from "../../../src/ui/background-client";

// persistRules の保存実行結果。
// 成功したか、またはバリデーション失敗時のエラー文言を保持する判別共用体。
export type PersistRulesResult = { ok: true } | { ok: false; error: string };

// 拡張機能の全体設定（有効状態・ルール一覧）の同期読み込み、トグル、永続化を管理するhook。
// バリデーションからストレージ保存、バックグラウンドへの再評価通知とReact状態更新までを一括処理する。
export function useSettings(windowId?: number) {
  const [enabled, setEnabled] = useState(true);
  const [rules, setRules] = useState<GroupingRule[]>([]);

  useEffect(() => {
    void (async () => {
      const settings = await loadSettings();
      setEnabled(settings.enabled);
      setRules(settings.rules);
    })();
  }, []);

  async function toggleEnabled(): Promise<boolean> {
    const settings = await loadSettings();
    const next = !enabled;
    await saveSettings({ ...settings, enabled: next });
    setEnabled(next);
    return next;
  }

  async function persistRules(nextRules: GroupingRule[]): Promise<PersistRulesResult> {
    const settings = await loadSettings();
    const normalizedRules = normalizePriorities(nextRules);
    const validation = validateSettings({ ...settings, rules: normalizedRules });
    if (!validation.value || validation.errors.length > 0) {
      return { ok: false, error: validation.errors.join(" ") || "Rule is invalid." };
    }

    await saveSettings(validation.value);
    setRules(validation.value.rules);
    if (windowId !== undefined) {
      await reevaluateWindow(windowId);
    }
    return { ok: true };
  }

  // 指定したルールの有効/無効を切り替えて設定を永続化する。
  // 切り替え後のenabled状態、またはエラー時はundefinedを返す。
  async function toggleRuleEnabled(ruleId: string): Promise<boolean | undefined> {
    const target = rules.find((rule) => rule.id === ruleId);
    if (!target) return undefined;
    const nextEnabled = !target.enabled;
    const nextRules = rules.map((rule) =>
      rule.id === ruleId ? { ...rule, enabled: nextEnabled } : rule,
    );
    const result = await persistRules(nextRules);
    if (!result.ok) return undefined;
    return nextEnabled;
  }

  return {
    enabled,
    rules,
    setRules,
    toggleEnabled,
    toggleRuleEnabled,
    persistRules,
  };
}
