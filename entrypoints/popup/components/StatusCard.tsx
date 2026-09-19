import { useMemo } from "react";
import { findMatchingRuleDetail } from "../../../src/core/rule-matcher";
import type { GroupingRule, TabStateRecord } from "../../../src/core/types";
import { GROUP_COLOR_HEX } from "../../../src/ui/group-colors";
import { describeTabStatus } from "../../../src/ui/tab-status";
import { formatTabUrl } from "../../../src/ui/rule-summary";

// StatusCard コンポーネントのプロパティ型定義。
// 現在のタブ情報・管理状態レコード・ルール一覧と、操作行からのアクション通知コールバックを受け取る。
export interface StatusCardProps {
  tab: chrome.tabs.Tab | undefined;
  state: TabStateRecord | undefined;
  rules: readonly GroupingRule[];
  onAction: (type: "return-tab" | "protect-tab" | "reevaluate-window") => void;
}

// 現在のアクティブタブの所属状態と詳細を表示し、手動操作を実行する状態カードコンポーネント。
// ファビコン・URL・ステータス文言・所属グループピル、および保護・再評価ボタンを提示する。
export function StatusCard({ tab, state, rules, onAction }: StatusCardProps) {
  const tabStatus = useMemo(() => describeTabStatus(state, tab, rules), [state, tab, rules]);
  const formattedUrl = useMemo(() => formatTabUrl(tab?.url), [tab?.url]);

  const managedRule = useMemo(() => {
    if (state?.managedRuleId) {
      return rules.find((rule) => rule.id === state.managedRuleId);
    }
    if (tab?.url) {
      return findMatchingRuleDetail(tab.url, rules)?.rule;
    }
    return undefined;
  }, [state?.managedRuleId, tab?.url, rules]);

  const isProtectedUser = state?.state === "protected-user";
  const isManaged = state?.state === "managed" && managedRule !== undefined;

  return (
    <div className="status-card">
      <div className="status-card-url-row">
        {tab?.favIconUrl ? (
          <img src={tab.favIconUrl} alt="" className="tab-favicon" />
        ) : (
          <span className="tab-favicon-fallback" aria-hidden="true" />
        )}
        <span className="tab-url-text" title={tab?.url}>
          {formattedUrl || "No active tab"}
        </span>
      </div>

      <div className="status-card-info-row">
        <div className="status-card-title-group">
          <strong className="status-title">{tabStatus.title}</strong>
          {tabStatus.detail && <small className="status-detail">{tabStatus.detail}</small>}
        </div>
        {isManaged && managedRule && (
          <div className="managed-pill">
            <span
              className="color-dot"
              style={{ backgroundColor: GROUP_COLOR_HEX[managedRule.color] }}
              aria-hidden="true"
            />
            <span className="managed-pill-name">{managedRule.name}</span>
          </div>
        )}
      </div>

      <div className="status-card-actions">
        {isProtectedUser ? (
          <button type="button" className="action-button" onClick={() => onAction("return-tab")}>
            Return to automation
          </button>
        ) : (
          <button type="button" className="action-button" onClick={() => onAction("protect-tab")}>
            Protect this tab
          </button>
        )}
        <button
          type="button"
          className="action-button"
          onClick={() => onAction("reevaluate-window")}
        >
          Re-evaluate window
        </button>
      </div>
    </div>
  );
}
