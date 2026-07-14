# Test plan

## Automated coverage

The Playwright suite builds and loads the unpacked extension and verifies:

- popup rendering, match-order guidance, conflict warnings, and React drag handles
- preservation of user, Claude, and other externally owned groups
- automatic resumption after a tab leaves an external group, including removal of a one-tab group
- automatic removal from an AutoGrouping group after the URL no longer matches

Unit tests cover matching, state transitions, mutation tracking, scheduling, group ordering, and rule-conflict detection.

## Required browser matrix

- Chrome 120: ordinary grouping and feature-detection fallback.
- Current Chrome Stable: complete regression suite.
- Current Chrome Beta: startup, grouping, external-group protection, and absence of fatal API errors.

## External group regression

1. Create a matching tab inside a manually or agent-created group.
2. Verify AutoGrouping does not move it while it remains in that group.
3. Remove it from the external group.
4. Verify the matching AutoGrouping rule is applied automatically.
5. Repeat with a one-tab external group that disappears when the tab leaves.
6. Move the tab into another external group and confirm that ownership is preserved again.

## Browser-agent regression

1. Ask the connected browser agent to create a group and open a matching page inside it.
2. Verify the tab remains in the agent-owned group and remains controllable by the agent.
3. Remove the tab from that group and verify normal automatic grouping resumes.
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
