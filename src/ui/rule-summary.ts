import { describePattern } from "../core/pattern-input";

// タブのURLからプロトコルを除去し、ホスト名とパス部分を結合した表示用文字列を生成する。
// 状態カードで現在の閲覧先を簡潔にユーザーへ提示するために使う純関数。
export function formatTabUrl(url: string | undefined): string {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    return `${parsed.host}${path}${parsed.search}`;
  } catch {
    return url;
  }
}

// ルールのパターン配列から最大3件のラベルを抽出し、超過分を「+N more」形式でまとめた要約文字列を生成する。
// グループ一覧の各行で設定済み対象サイトを1行で分かりやすく表示するために使う純関数。
export function formatRuleSummary(patterns: readonly string[]): string {
  if (patterns.length === 0) return "No target sites";
  const displayed = patterns.slice(0, 3).map((pattern) => describePattern(pattern).label);
  const remainingCount = patterns.length - 3;
  if (remainingCount > 0) {
    return `${displayed.join(", ")} +${remainingCount} more`;
  }
  return displayed.join(", ");
}
