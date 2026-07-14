import type { TabManagementState, TabStateRecord } from "./types";

export type TabEvent =
  | { type: "created"; at: number }
  | { type: "rule-matched"; ruleId: string; at: number }
  | { type: "rule-unmatched"; at: number }
  | { type: "external-group"; at: number }
  | { type: "external-left"; at: number }
  | { type: "user-protect"; at: number }
  | { type: "split-entered"; at: number }
  | { type: "split-left"; at: number }
  | { type: "pinned"; at: number }
  | { type: "manual-reset"; at: number };

export function initialTabState(tabId: number, at = Date.now()): TabStateRecord {
  return { tabId, state: "pending", updatedAt: at };
}

export function reduceTabState(current: TabStateRecord, event: TabEvent): TabStateRecord {
  if (
    current.state === "protected-user" &&
    event.type !== "manual-reset" &&
    event.type !== "split-entered"
  ) {
    return { ...current, updatedAt: event.at };
  }

  switch (event.type) {
    case "created":
      return { tabId: current.tabId, state: "pending", updatedAt: event.at };
    case "rule-matched":
      return {
        tabId: current.tabId,
        state: "managed",
        managedRuleId: event.ruleId,
        updatedAt: event.at,
      };
    case "rule-unmatched":
      return { tabId: current.tabId, state: "unmatched", updatedAt: event.at };
    case "external-group":
      return {
        tabId: current.tabId,
        state: "protected-external",
        updatedAt: event.at,
      };
    case "external-left":
      return { tabId: current.tabId, state: "pending", updatedAt: event.at };
    case "user-protect":
      return {
        tabId: current.tabId,
        state: "protected-user",
        updatedAt: event.at,
      };
    case "pinned":
      return { tabId: current.tabId, state: "ignored-pinned", updatedAt: event.at };
    case "manual-reset":
      return { tabId: current.tabId, state: "pending", updatedAt: event.at };
    case "split-entered": {
      const resumeState =
        current.state === "protected-split-view" ? current.resumeState : current.state;
      return {
        tabId: current.tabId,
        state: "protected-split-view",
        ...(resumeState === undefined ? {} : { resumeState }),
        ...(current.managedRuleId === undefined ? {} : { managedRuleId: current.managedRuleId }),
        updatedAt: event.at,
      };
    }
    case "split-left": {
      const resumeState: Exclude<TabManagementState, "protected-split-view"> =
        current.resumeState ?? "pending";
      return {
        tabId: current.tabId,
        state: resumeState,
        ...(current.managedRuleId === undefined ? {} : { managedRuleId: current.managedRuleId }),
        updatedAt: event.at,
      };
    }
  }
}
