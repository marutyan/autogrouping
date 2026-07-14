# Manual Chrome QA runbook

Use this runbook before marking the initial AutoGrouping release ready. Record results directly in Issues #1, #2, and #3.

## Preparation

1. Update and build the branch:

   ```bash
   git pull --rebase origin agent/initial-implementation
   mise exec -- pnpm check
   mise exec -- pnpm build
   ```

2. Open `chrome://extensions`.
3. Enable Developer mode.
4. Load or reload `.output/chrome-mv3`.
5. Open `chrome://version` and record:
   - Chrome version
   - operating system
   - command-line flags, if any
6. Open the AutoGrouping service-worker inspector and keep the Console visible during testing.

## Test data

Create these groups in the popup, in this order:

1. `GitHub` — keyword `github` — blue
2. `Google Docs` — site `docs.google.com` — green
3. `Research` — site `arxiv.org` — purple

Keep one unmatched tab such as `example.com` open after the managed groups.

## Chrome Stable and Beta regression — Issue #1

Run this section once in current Chrome Stable and once in current Chrome Beta.

### Installation and startup

- [ ] The unpacked extension loads without a manifest error.
- [ ] The popup opens and shows saved groups.
- [ ] Closing and reopening Chrome restores rules and resumes grouping.
- [ ] Clicking **Service worker** → **Stop**, then opening or updating a matching tab restarts the worker without losing rules.
- [ ] No uncaught error appears in the service-worker Console.

### Rule editing and grouping

- [ ] A GitHub URL enters the `GitHub` group.
- [ ] `gist.github.com` matches the `github` keyword.
- [ ] `githubusercontent.com` does not match the `github` keyword.
- [ ] A Google Docs URL enters the `Google Docs` group.
- [ ] Returning or navigating to an unmatched URL removes the tab from its AutoGrouping-owned group.
- [ ] Managed groups appear in popup order, followed by unmatched tabs and external groups.
- [ ] Dragging a popup row changes both matching priority and browser group order.
- [ ] Changing the color square updates the actual Chrome tab-group color.

### Manual protection

- [ ] **Protect this tab** prevents regrouping after navigation.
- [ ] **Return to automation** clears explicit protection and immediately re-evaluates the tab.
- [ ] A pinned tab remains ungrouped and in place.

## Split View regression — Issue #2

1. Open two tabs that normally match AutoGrouping rules.
2. Put them into Chrome Split View.
3. Navigate or reload both sides while watching the service-worker Console and Chrome Task Manager.

Expected results:

- [ ] AutoGrouping does not group, ungroup, or reorder either Split View tab.
- [ ] No repeating group-change loop appears in the Console.
- [ ] Chrome remains responsive and there is no sustained CPU spike attributable to the extension.
- [ ] Exiting Split View does not cause an immediate mutation race.
- [ ] After the settle delay, normal URL-rule evaluation resumes.
- [ ] Managed groups return to popup order.

## Claude or browser-agent regression — Issue #3

1. Ask the browser agent to create a group named `Claude`.
2. Ask it to open or move a matching GitHub URL into that group.
3. Leave the tab in the agent-created group for at least ten seconds.

Expected results:

- [ ] AutoGrouping does not reclaim or reorder the tab while it remains in `Claude`.
- [ ] The agent can continue inspecting, navigating, and controlling the tab.
- [ ] Removing the tab from `Claude` causes normal AutoGrouping evaluation to resume automatically.
- [ ] Moving it into a second external group preserves the new external ownership.
- [ ] Explicit **Protect this tab** remains sticky until **Return to automation** is selected.
- [ ] No repeating group-change loop, visible CPU spike, or Chrome freeze occurs.

## Failure evidence

For any failed item, attach:

- Chrome version and channel
- operating system
- exact steps from a fresh browser window
- screenshot or screen recording
- service-worker Console output
- whether Split View, a browser agent, or another grouping extension was active
- the current branch commit from `git rev-parse --short HEAD`

## Issue comment template

```text
Environment:
- Commit:
- Chrome channel/version:
- OS:

Passed:
- [ ] Installation/startup
- [ ] Rule editing/grouping
- [ ] Manual protection
- [ ] Split View
- [ ] Browser-agent coexistence

Failures or observations:
- None

Evidence:
- Console errors: None
- Screenshots/recording:
```

## Completion criteria

- Close Issue #1 after Stable and Beta both pass.
- Close Issue #2 after the supported Split View regression passes without loops, freezes, or premature mutations.
- Close Issue #3 after a real Claude or browser-agent session passes the external-group scenarios.
- Keep PR #8 in Draft until Issues #1, #2, and #3 are complete.