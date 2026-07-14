# Architecture

## Ownership boundary

AutoGrouping only mutates groups recorded as its own. While a tab belongs to a user, Claude, browser-agent, or other-extension group, that membership is treated as external intent and left untouched. The protection is temporary: after the tab leaves the external group, normal URL-rule evaluation resumes automatically. Explicit user protection remains sticky until Return to automation is selected.

## Split View boundary

Split View is detected through feature detection. No group mutation or sorting operation is issued while a tab or its window is in Split View. Group-membership changes during the Split View transition are deferred to avoid mistaking Chrome's internal changes for user or agent intent.

## Popup architecture

The popup is the complete configuration surface. Drag reordering, inline color selection, conflict feedback, match reasons, and Undo are implemented as React state and event handlers. There are no DOM-observer shims and no separate options page.

Rule order has two effects:

1. Matching priority is evaluated from top to bottom.
2. AutoGrouping-owned Chrome groups are sorted into the same order after pinned tabs.

Conflict feedback compares representative URLs for keyword, hostname, and wildcard patterns. It is advisory; the deterministic top-to-bottom matcher remains the source of truth.

## Storage

- `storage.sync`: user settings and grouping rules.
- `storage.session`: tab state and session-specific group IDs.
- `storage.local`: persistent evidence that AutoGrouping previously created a group for a rule.

## Event model

- Per-tab schedulers coalesce rapid URL and grouping updates.
- A per-window mutex serializes grouping mutations.
- A pending-mutation tracker distinguishes internal changes from external changes.
- A window sorter moves only AutoGrouping-owned groups.
- `tabs.onActivated` is intentionally not a grouping trigger.

## Validation

Unit tests cover pure matching and state logic. Playwright launches the built unpacked extension in a persistent Chromium context to exercise popup rendering and real tab/group API behavior. Split View remains a manual Stable/Beta regression because Playwright does not provide a reliable Split View control surface.

## Privacy

The extension has no content script, remote API, analytics, advertising, or telemetry. URLs are evaluated locally against user-defined rules and are not retained as browsing history.
