# AutoGrouping Privacy Policy

Effective date: July 14, 2026

AutoGrouping is a Chrome extension that organizes browser tabs into user-defined groups. This policy explains what information the extension processes and how that information is handled.

## Information processed

AutoGrouping processes only the browser information needed to provide tab grouping:

- tab URLs used to evaluate user-defined matching rules
- tab, window, and tab-group identifiers
- tab state such as pinned, grouped, or Split View status
- user-created group names, colors, rule order, and URL patterns
- temporary operational state used to distinguish AutoGrouping changes from user, browser-agent, or other-extension changes

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

- `chrome.storage.sync` stores user settings and grouping rules. Chrome may synchronize this data through the user's signed-in Chrome profile.
- `chrome.storage.session` stores temporary tab state for the current browser session.
- `chrome.storage.local` stores limited ownership metadata used to recognize groups previously created by AutoGrouping.

Chrome controls the persistence and synchronization behavior of these storage areas. Users can remove rules from the extension, clear the extension's stored data through Chrome, disable Chrome Sync, or uninstall AutoGrouping.

## Data transmission and sharing

AutoGrouping:

- does not send browsing information or settings to the developer or any external server
- does not use analytics, telemetry, advertising, tracking pixels, or remote logging
- does not sell, rent, or share user data
- does not use remotely hosted code
- does not create user accounts

All rule evaluation and tab management occur locally in Chrome.

## Permissions

AutoGrouping requests only the permissions required for its functionality:

- `storage`: save rules, settings, and operational state
- `tabs`: inspect tab URLs and grouping state, and move or ungroup tabs
- `tabGroups`: create, update, and reorder Chrome tab groups
- `contextMenus`: provide manual actions such as protecting a tab or returning it to automation

## Data retention

Settings remain in Chrome extension storage until the user changes or removes them, clears extension data, or uninstalls the extension. Synced settings may be retained according to the user's Chrome Sync configuration and Google's Chrome Sync behavior.

## Security

AutoGrouping has no external backend and does not transmit user data over a network. The source code is available in the AutoGrouping GitHub repository for inspection.

## Changes to this policy

Material changes to this policy will be recorded in the repository and published with the effective date updated above.

## Contact

Questions or privacy concerns can be submitted through the AutoGrouping GitHub Issues page.