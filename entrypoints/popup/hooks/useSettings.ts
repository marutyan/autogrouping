import { useEffect, useRef, useState } from "react";
import { normalizePriorities } from "../../../src/core/rule-list";
import { validateSettings } from "../../../src/core/rule-validation";
import type { GroupingRule } from "../../../src/core/types";
import { loadSettings, saveSettings } from "../../../src/storage/settings-repository";
import { reevaluateWindow } from "../../../src/ui/background-client";
import { SerializedQueue } from "../../../src/ui/serialized-queue";

// persistRules の保存実行結果。
// 成功したか、またはバリデーション失敗時のエラー文言を保持する判別共用体。
export type PersistRulesResult = { ok: true } | { ok: false; error: string };

// 拡張機能の全体設定（有効状態・ルール一覧）の同期読み込み、トグル、永続化を管理するhook。
// 保存操作をSerializedQueueで直列化し、素早い連続クリックや複数行操作でも上書きを防ぐ。
export function useSettings(windowId?: number) {
  const [enabled, setEnabled] = useState(true);
  const [rules, setRules] = useState<GroupingRule[]>([]);
  const queueRef = useRef<SerializedQueue<GroupingRule[]>>(new SerializedQueue<GroupingRule[]>([]));

  useEffect(() => {
    void (async () => {
      const settings = await loadSettings();
      setEnabled(settings.enabled);
      setRules(settings.rules);
      queueRef.current.setCurrent(settings.rules);
    })();
  }, []);

  async function toggleEnabled(): Promise<boolean> {
    const settings = await loadSettings();
    const next = !enabled;
    await saveSettings({ ...settings, enabled: next });
    setEnabled(next);
    return next;
  }

  async function saveRulesInternal(
    rulesToSave: GroupingRule[],
  ): Promise<{ ok: true; rules: GroupingRule[] } | { ok: false; error: string }> {
    const settings = await loadSettings();
    const normalizedRules = normalizePriorities(rulesToSave);
    const validation = validateSettings({ ...settings, rules: normalizedRules });
    if (!validation.value || validation.errors.length > 0) {
      return { ok: false, error: validation.errors.join(" ") || "Rule is invalid." };
    }

    await saveSettings(validation.value);
    if (windowId !== undefined) {
      await reevaluateWindow(windowId);
    }
    return { ok: true, rules: validation.value.rules };
  }

  // ルール一覧の更新関数を受け取り、直列化キュー内で最新のルール配列に適用して保存する。
  // 行トグルの保存待ち中に並び替え・削除・追加等が行われても互いの更新を破棄せず最新状態に適用される。
  async function persistRules(
    updater: (current: GroupingRule[]) => GroupingRule[],
  ): Promise<PersistRulesResult> {
    return await queueRef.current.enqueue<PersistRulesResult>(async (currentRules) => {
      const nextRules = updater(currentRules);
      const result = await saveRulesInternal(nextRules);
      if (result.ok) {
        setRules(result.rules);
        return { next: result.rules, result: { ok: true } };
      }
      return { next: currentRules, result };
    });
  }

  // 指定したルールの有効/無効を切り替えて設定を永続化する。
  // キュー内でrefの最新ルール配列から次の配列を生成し、直列に保存して完了後に状態を更新する。
  async function toggleRuleEnabled(ruleId: string): Promise<boolean | undefined> {
    return await queueRef.current.enqueue(async (currentRules) => {
      const target = currentRules.find((rule) => rule.id === ruleId);
      if (!target) {
        return { next: currentRules, result: undefined };
      }
      const nextEnabled = !target.enabled;
      const updatedRules = currentRules.map((rule) =>
        rule.id === ruleId ? { ...rule, enabled: nextEnabled } : rule,
      );
      const result = await saveRulesInternal(updatedRules);
      if (result.ok) {
        setRules(result.rules);
        return { next: result.rules, result: nextEnabled };
      }
      return { next: currentRules, result: undefined };
    });
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
