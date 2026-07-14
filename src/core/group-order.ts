import type { GroupingRule, OwnedGroup } from "./types";

interface RuleOrder {
  priority: number;
  listIndex: number;
}

export function orderedOwnedGroupIds(
  groups: Iterable<OwnedGroup>,
  rules: readonly GroupingRule[],
  windowId: number,
): number[] {
  const orderByRuleId = new Map<string, RuleOrder>();
  for (const [listIndex, rule] of rules.entries()) {
    if (!rule.enabled) continue;
    orderByRuleId.set(rule.id, { priority: rule.priority, listIndex });
  }

  return [...groups]
    .filter((group) => group.windowId === windowId && orderByRuleId.has(group.ruleId))
    .sort((left, right) => {
      const leftOrder = orderByRuleId.get(left.ruleId);
      const rightOrder = orderByRuleId.get(right.ruleId);
      if (!leftOrder || !rightOrder) return 0;
      if (leftOrder.priority !== rightOrder.priority) {
        return leftOrder.priority - rightOrder.priority;
      }
      if (leftOrder.listIndex !== rightOrder.listIndex) {
        return leftOrder.listIndex - rightOrder.listIndex;
      }
      if (left.createdAt !== right.createdAt) return left.createdAt - right.createdAt;
      return left.groupId - right.groupId;
    })
    .map((group) => group.groupId);
}
