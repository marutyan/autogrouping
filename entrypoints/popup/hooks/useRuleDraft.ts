import { useState } from "react";
import {
  inferScope,
  isSimplePattern,
  patternFromInput,
  patternToInput,
  type SiteScope,
} from "../../../src/core/pattern-input";
import { createRuleDraft } from "../../../src/core/rule-list";
import type { GroupingRule } from "../../../src/core/types";

// useRuleDraft hook の初期化オプション。
// 優先順位初期化用の既存ルール一覧、アクティブタブURL、エラー通知用関数を受け取る。
export interface UseRuleDraftOptions {
  rules: readonly GroupingRule[];
  currentTabUrl?: string | undefined;
  onMessage: (message: string) => void;
}

// ルールの新規作成・編集フォームおよびターゲットURL登録フォームの状態管理を担当するhook。
// 入力パターンのバリデーション、ターゲットの追加・編集・削除、ドラフト破棄などのロジックを提供する。
export function useRuleDraft({ rules, currentTabUrl, onMessage }: UseRuleDraftOptions) {
  const [draft, setDraft] = useState<GroupingRule>();
  const [targetInput, setTargetInput] = useState("");
  const [targetScope, setTargetScope] = useState<SiteScope>("site");
  const [editingPattern, setEditingPattern] = useState<string>();

  function resetTargetEditor() {
    setTargetInput("");
    setTargetScope("site");
    setEditingPattern(undefined);
  }

  function resetDraft() {
    setDraft(undefined);
    resetTargetEditor();
  }

  function beginAddRule() {
    onMessage("");
    resetTargetEditor();
    setDraft(createRuleDraft(rules));
  }

  function beginAddRuleWithPatterns(patterns: readonly string[]) {
    onMessage("");
    resetTargetEditor();
    setDraft(createRuleDraft(rules, patterns));
  }

  function beginEditRule(rule: GroupingRule) {
    onMessage("");
    resetTargetEditor();
    setDraft({ ...rule, patterns: [...rule.patterns] });
  }

  function startEditingTarget(pattern: string) {
    if (!isSimplePattern(pattern)) {
      setEditingPattern(undefined);
      setTargetInput("");
      setTargetScope("site");
      onMessage("This custom wildcard can be edited under Advanced matching patterns.");
      return;
    }
    const scope = inferScope(pattern);
    setEditingPattern(pattern);
    setTargetInput(patternToInput(pattern, scope));
    setTargetScope(scope);
    onMessage("");
  }

  function beginEditTarget(rule: GroupingRule, pattern: string) {
    onMessage("");
    setDraft({ ...rule, patterns: [...rule.patterns] });
    startEditingTarget(pattern);
  }

  function saveTarget(value = targetInput, scope = targetScope, replacedPattern = editingPattern) {
    if (!draft) return;
    const pattern = patternFromInput(value, scope);
    if (!pattern) {
      onMessage("Enter a valid URL, domain, or site keyword such as github.");
      return;
    }

    const otherPatterns = replacedPattern
      ? draft.patterns.filter((item) => item !== replacedPattern)
      : draft.patterns;
    if (otherPatterns.includes(pattern)) {
      onMessage("That target is already included.");
      return;
    }

    const nextPatterns = replacedPattern
      ? draft.patterns.map((item) => (item === replacedPattern ? pattern : item))
      : [...draft.patterns, pattern];
    setDraft({ ...draft, patterns: nextPatterns });
    resetTargetEditor();
    onMessage("");
  }

  function addCurrentSite() {
    if (!currentTabUrl) return;
    saveTarget(currentTabUrl, "site", undefined);
  }

  function removeTarget(pattern: string) {
    if (!draft) return;
    setDraft({ ...draft, patterns: draft.patterns.filter((item) => item !== pattern) });
    if (editingPattern === pattern) resetTargetEditor();
  }

  return {
    draft,
    setDraft,
    targetInput,
    setTargetInput,
    targetScope,
    setTargetScope,
    editingPattern,
    resetTargetEditor,
    resetDraft,
    beginAddRule,
    beginAddRuleWithPatterns,
    beginEditRule,
    beginEditTarget,
    startEditingTarget,
    saveTarget,
    addCurrentSite,
    removeTarget,
  };
}
