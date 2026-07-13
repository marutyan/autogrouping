# Architecture

## Ownership boundary

AutoGrouping only mutates groups recorded as its own. A tab membership change that does not match a pending AutoGrouping mutation is classified as external intent and remains protected until the tab closes or the user explicitly returns it to automation.

## Split View boundary

Split View is detected through feature detection. No group mutation is issued while a tab or its window is in Split View. Group-membership changes during the Split View transition are deferred to avoid mistaking Chrome's internal changes for user or agent intent.

## Storage

- `storage.sync`: user settings and grouping rules.
- `storage.session`: tab state and session-specific group IDs.
- `storage.local`: schema metadata and persistent evidence that AutoGrouping previously created a group for a rule.

## Event model

- Per-tab scheduler coalesces rapid updates.
- Per-window mutex serializes grouping mutations.
- Pending-mutation tracker distinguishes internal changes from external changes.
- `tabs.onActivated` is intentionally not a grouping trigger.

## Privacy

The extension has no content script, remote API, analytics, advertising, or telemetry. URLs are evaluated locally against user-defined rules and are not retained as browsing history.
