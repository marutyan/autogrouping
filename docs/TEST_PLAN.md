# Test plan

## Required browser matrix

- Chrome 120: ordinary grouping and feature-detection fallback.
- Current Chrome Stable: complete regression suite.
- Current Chrome Beta: startup, grouping, external-group protection, and absence of fatal API errors.

## External group regression

1. Create a matching tab.
2. Move it into a manually created group before the grace period ends.
3. Verify AutoGrouping does not move it.
4. Remove it from the external group.
5. Verify it remains protected.
6. Use “Return this tab to AutoGrouping”.
7. Verify the matching rule is applied.

## Browser-agent regression

1. Ask the connected browser agent to open a page matching an AutoGrouping rule.
2. Allow the agent to create or use its own group.
3. Verify the tab remains in the agent-owned group and remains controllable by the agent.
4. Verify no repeating group-update logs or CPU spike occur.

## Split View regression

1. Put two tabs into Chrome Split View.
2. Confirm no group, ungroup, move, or alignment call is issued for either tab.
3. Confirm Chrome remains responsive.
4. Exit Split View.
5. Confirm AutoGrouping waits for the settle delay and then safely re-evaluates tabs.

## Load regression

- Restore 100 tabs across 20 groups and 30 rules.
- Confirm no unbounded event loop.
- Confirm session reconciliation completes and Chrome remains interactive.
