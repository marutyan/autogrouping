import type { GroupColor } from "../core/types";

// Chromeのグループ色の識別子一覧と、対応するCSSカスタムプロパティの参照マップ。
// 配色定義をstyle.cssに一元化し、ライト/ダーク両モードで適切な色を適用するために使う。
export const GROUP_COLORS: GroupColor[] = [
  "grey",
  "blue",
  "red",
  "yellow",
  "green",
  "pink",
  "purple",
  "cyan",
  "orange",
];

export const GROUP_COLOR_HEX: Record<GroupColor, string> = {
  grey: "var(--group-grey)",
  blue: "var(--group-blue)",
  red: "var(--group-red)",
  yellow: "var(--group-yellow)",
  green: "var(--group-green)",
  pink: "var(--group-pink)",
  purple: "var(--group-purple)",
  cyan: "var(--group-cyan)",
  orange: "var(--group-orange)",
};
