export const TAB_GROUP_ID_NONE = -1;
export const SPLIT_VIEW_ID_NONE = -1;

export type GroupColor =
  | "grey"
  | "blue"
  | "red"
  | "yellow"
  | "green"
  | "pink"
  | "purple"
  | "cyan"
  | "orange";

export interface GroupingRule {
  id: string;
  name: string;
  color: GroupColor;
  patterns: string[];
  priority: number;
  enabled: boolean;
  createdAt: number;
}

export type TabManagementState =
  | "pending"
  | "managed"
  | "protected-external"
  | "protected-user"
  | "protected-split-view"
  | "ignored-pinned"
  | "unmatched";

export interface TabStateRecord {
  tabId: number;
  state: TabManagementState;
  updatedAt: number;
  managedRuleId?: string;
  resumeState?: Exclude<TabManagementState, "protected-split-view">;
}

export interface OwnedGroup {
  windowId: number;
  groupId: number;
  ruleId: string;
  createdAt: number;
}

export type MutationKind = "group" | "ungroup" | "move";

export interface PendingMutation {
  tabId: number;
  kind: MutationKind;
  operationId: string;
  expiresAt: number;
  expectedGroupId?: number;
}

export interface ExtensionSettings {
  enabled: boolean;
  newTabGracePeriodMs: number;
  splitViewSettleDelayMs: number;
  rules: GroupingRule[];
  schemaVersion: 1;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  enabled: true,
  newTabGracePeriodMs: 0,
  splitViewSettleDelayMs: 500,
  rules: [],
  schemaVersion: 1,
};
