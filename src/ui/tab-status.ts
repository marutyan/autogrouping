import { describePattern } from "../core/pattern-input";
import { findMatchingRuleDetail } from "../core/rule-matcher";
import type { GroupingRule, TabStateRecord } from "../core/types";

// URLから表示用のホスト名詳細文字列を生成する。
// タブのURLからドメイン名を抽出し、未マッチ時の補足表示として使う純関数。
export function hostnameDetail(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return `Hostname: ${new URL(url).hostname}`;
  } catch {
    return undefined;
  }
}

// タブの状態レコード・タブ情報・ルール一覧からPopupヘッダーに表示する状態タイトルと詳細文を決定する。
// 保護状態やマッチ状況に応じて利用者に分かりやすいステータス案内を返す純関数。
export function describeTabStatus(
  state: TabStateRecord | undefined,
  tab: { url?: string | undefined } | undefined,
  rules: readonly GroupingRule[],
): { title: string; detail: string | undefined } {
  const matching = tab?.url ? findMatchingRuleDetail(tab.url, rules) : undefined;
  const managedRule = state?.managedRuleId
    ? rules.find((rule) => rule.id === state.managedRuleId)
    : matching?.rule;

  switch (state?.state) {
    case "managed":
      return {
        title: managedRule ? `Managed by ${managedRule.name}` : "Managed by AutoGrouping",
        detail: matching ? `Matched target: ${describePattern(matching.pattern).label}` : undefined,
      };
    case "protected-external":
      return { title: "In external group", detail: "External group ownership is preserved." };
    case "protected-user":
      return { title: "Protected manually", detail: "Use Return to automation to resume." };
    case "protected-split-view":
      return {
        title: "Protected by Split View",
        detail: "Grouping resumes after Split View ends.",
      };
    case "ignored-pinned":
      return { title: "Pinned and ignored", detail: "Pinned tabs remain in place." };
    case "unmatched":
      return { title: "No matching group", detail: hostnameDetail(tab?.url) };
    default:
      return {
        title: "Checking…",
        detail: matching ? `Potential match: ${matching.rule.name}` : hostnameDetail(tab?.url),
      };
  }
}
