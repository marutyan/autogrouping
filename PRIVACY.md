# AutoGrouping Privacy Policy

Effective date: July 14, 2026

AutoGrouping is a Chrome extension that organizes browser tabs into user-defined groups. This policy explains what information the extension processes and how that information is handled.

## Information processed

AutoGrouping processes only the browser information needed to provide tab grouping:

- observed tab URLs, which are web browsing activity, used transiently to evaluate user-defined matching rules
- tab, window, and tab-group identifiers
- tab state such as pinned, grouped, or Split View status
- user-created group names, colors, rule order, and URL patterns
- temporary operational state used to distinguish AutoGrouping changes from user, browser-agent, or other-extension changes

Observed tab URLs and user-created URL patterns are different:

- An **observed tab URL** is read from the currently open tab when AutoGrouping evaluates a rule. AutoGrouping does not retain observed tab URLs as browsing history.
- A **user-created URL pattern** is configuration entered by the user, such as `github` or `docs.google.com`. These patterns are stored with the user's other extension settings so the rules can be restored.

AutoGrouping does not read page contents, form entries, passwords, messages, cookies, screenshots, or other content inside websites.

## How information is used

The information above is used only to:

- determine whether a tab matches a grouping rule
- create, update, and order tab groups
- preserve groups created by users, browser agents, and other extensions
- avoid changing tabs while Chrome Split View is active
- save the user's settings and restore extension state

## Storage

AutoGrouping stores data using Chrome's extension storage APIs:

- `chrome.storage.sync` stores user settings and grouping rules, including user-created URL patterns. Chrome may synchronize this data through the user's signed-in Chrome profile.
- `chrome.storage.session` stores temporary tab identifiers and management state for the current browser session. It does not store observed tab URLs.
- `chrome.storage.local` stores limited ownership metadata used to recognize groups previously created by AutoGrouping. It does not store observed tab URLs.

Chrome controls the persistence and synchronization behavior of these storage areas. Users can remove rules from the extension, clear the extension's stored data through Chrome, disable Chrome Sync, or uninstall AutoGrouping.

## Data transmission and sharing

AutoGrouping:

- does not send observed tab URLs, browsing activity, settings, or other user data to the developer or any external server
- does not use analytics, telemetry, advertising, tracking pixels, or remote logging
- does not sell, rent, share, or transfer user data
- does not use remotely hosted code
- does not create user accounts

All rule evaluation and tab management occur locally in Chrome.

## Chrome Web Store Limited Use compliance

AutoGrouping's use of information received from Chrome APIs complies with the Chrome Web Store User Data Policy, including the Limited Use requirements:

- data is used only to provide or improve AutoGrouping's disclosed, user-facing tab-grouping functionality
- data is not transferred to third parties
- data is not used for personalized, retargeted, or interest-based advertising
- humans do not read or review user data because AutoGrouping has no backend, telemetry, or developer-accessible data store

## Permissions

AutoGrouping requests only the permissions required for its current functionality:

- `storage`: save rules, settings, and operational state
- `tabs`: read tab URLs and grouping state for rule evaluation, and move or ungroup tabs
- `tabGroups`: create, update, color, and reorder Chrome tab groups
- `contextMenus`: provide manual actions such as protecting a tab or returning it to automation

AutoGrouping does not request host permissions or permission to read website contents.

## Data retention

Observed tab URLs are not written to AutoGrouping's extension storage and are not retained as browsing history. User-created settings and URL patterns remain in Chrome extension storage until the user changes or removes them, clears extension data, or uninstalls the extension. Synced settings may be retained according to the user's Chrome Sync configuration and Google's Chrome Sync behavior.

## Security

AutoGrouping has no external backend and does not transmit user data over a network. The source code is available in the AutoGrouping GitHub repository for inspection.

## Changes to this policy

Material changes to this policy will be recorded in the repository and published with the effective date updated above.

## Contact

Questions or privacy concerns can be submitted through the AutoGrouping GitHub Issues page.
