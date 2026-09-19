// 対象サイトの指定範囲（ドメイン全体、前方一致パス、完全一致URL）。
// UIのドロップダウンで選択し、マッチングパターンの生成方式を切り替えるために定義する。
export type SiteScope = "site" | "path" | "page";

// 入力文字列とスコープからAutoGroupingのURLマッチングパターン文字列を生成する。
// 利用者が入力したドメインやキーワードを拡張機能の内部パターン形式へ正規化する純関数。
export function patternFromInput(value: string, scope: SiteScope): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  if (/^[a-z0-9-]+$/i.test(trimmed)) return `${trimmed.toLowerCase()}/*`;

  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    if (!/^https?:$/.test(url.protocol) || !url.hostname) return undefined;
    if (scope === "site") return `${url.hostname}/*`;
    if (scope === "page") return `${url.hostname}${url.pathname}${url.search}`;
    const path = url.pathname === "/" ? "/" : url.pathname.replace(/\/+$/, "");
    return `${url.hostname}${path === "/" ? "/*" : `${path}*`}`;
  } catch {
    return undefined;
  }
}

// パターンが簡易エディタで扱える単純な構造（site/path/page）か判定する。
// 途中にワイルドカードを含む複雑なパターンを通常エディタではなく高度設定へ誘導するために使う。
export function isSimplePattern(pattern: string): boolean {
  const normalized = pattern.replace(/^\*:\/\//, "").replace(/^https?:\/\//, "");
  const hostname = normalized.split("/")[0] ?? "";
  const path = normalized.slice(hostname.length);
  return !hostname.includes("*") && (!path.includes("*") || path.endsWith("*"));
}

// パターン文字列の末尾形状からサイトスコープ（site/path/page）を推定する。
// 既存パターンの編集開始時に入力UIのスコープ選択肢を復元するために使う。
export function inferScope(pattern: string): SiteScope {
  const normalized = pattern.replace(/^\*:\/\//, "").replace(/^https?:\/\//, "");
  if (normalized.endsWith("/*")) return "site";
  if (normalized.endsWith("*")) return "path";
  return "page";
}

// パターン文字列を編集用入力フィールドの表示形式へ復元する。
// ワイルドカード表記（/*や*）を取り除き、利用者が入力しやすいURLやホスト名に戻す。
export function patternToInput(pattern: string, scope: SiteScope): string {
  const normalized = pattern.replace(/^\*:\/\//, "").replace(/^https?:\/\//, "");
  if (scope === "site") return normalized.replace(/\/\*$/, "");
  if (scope === "path") return `https://${normalized.replace(/\*$/, "")}`;
  return `https://${normalized}`;
}

// パターン文字列を表示用ラベルとスコープ種別の説明へ分解する。
// ルール一覧のチップや編集フォームのバッジで利用者に分かりやすく表示するために使う。
export function describePattern(pattern: string): { label: string; scope: string } {
  const normalized = pattern.replace(/^\*:\/\//, "").replace(/^https?:\/\//, "");
  const slashIndex = normalized.indexOf("/");
  const hostname = slashIndex === -1 ? normalized : normalized.slice(0, slashIndex);
  const path = slashIndex === -1 ? "" : normalized.slice(slashIndex);
  if (/^[a-z0-9-]+$/i.test(hostname) && path === "/*") {
    return { label: hostname, scope: "Site keyword" };
  }
  if (path === "/*") return { label: hostname, scope: "Entire site" };
  if (!path) {
    return { label: hostname, scope: normalized.includes("*") ? "Custom" : "Exact host" };
  }
  if (path.includes("*")) {
    return { label: hostname, scope: `${path.replaceAll("*", "…")} path` };
  }
  return { label: hostname, scope: "Exact page" };
}
