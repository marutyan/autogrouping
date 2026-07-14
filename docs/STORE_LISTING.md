# Chrome Web Store listing draft

## Product details

- **Name:** AutoGrouping
- **Category:** Productivity
- **Language:** English
- **Single purpose:** Automatically organize Chrome tabs into user-defined groups while preserving user-controlled, browser-agent, and Split View behavior.

## Short description

Automatically group Chrome tabs by site while respecting Split View and groups created by you or browser agents.

## Detailed description

AutoGrouping keeps busy Chrome windows organized by placing matching tabs into groups you define.

Create a group, add a domain or site keyword such as `github`, choose a Chrome group color, and AutoGrouping handles the rest. Groups are evaluated from top to bottom, and the same order is used to arrange AutoGrouping-owned tab groups in the browser.

### Key features

- Automatically group tabs by domain, URL path, exact page, or site keyword
- Reorder groups by dragging to control matching priority and browser position
- Change Chrome tab-group colors directly from the popup
- Remove tabs from managed groups when their URLs no longer match
- Show why the current tab matched or did not match a group
- Warn when multiple rules overlap
- Undo accidental group deletion or reordering
- Preserve groups created manually, by browser agents, or by other extensions
- Pause mutations while Chrome Split View is active
- Protect individual tabs from automatic grouping when needed

AutoGrouping only changes groups it created. A tab inside an external group remains untouched. After it leaves that group, normal rule evaluation resumes automatically. Explicit manual protection remains active until the user selects **Return to automation**.

All matching and tab management occur locally in Chrome. AutoGrouping has no analytics, advertising, telemetry, remote service, or user account.

## Permission justifications

### `storage`

Stores user-created rules, colors, rule order, extension settings, and limited operational state required to restore grouping behavior.

### `tabs`

Reads tab URLs and grouping state so rules can be evaluated, and moves or ungroups tabs when applying those rules. AutoGrouping does not read page contents.

### `tabGroups`

Creates, updates, colors, and reorders Chrome tab groups owned by AutoGrouping.

### `contextMenus`

Provides manual tab actions, including protecting a tab, returning it to automation, and re-evaluating the current window.

## Privacy practices draft

Recommended Chrome Web Store answers based on the current implementation:

- **Personally identifiable information:** Not collected
- **Health information:** Not collected
- **Financial and payment information:** Not collected
- **Authentication information:** Not collected
- **Personal communications:** Not collected
- **Location:** Not collected
- **Web history:** Not collected or transmitted; the current tab URL is processed locally only to apply user-defined rules
- **User activity:** Not collected or transmitted
- **Website content:** Not collected
- **Data sale or transfer:** None
- **Advertising:** None
- **Analytics or telemetry:** None
- **Remote code:** None

The final submission should be checked against the current Chrome Web Store questionnaire wording before publication.

## Screenshot plan

Capture screenshots at the dimensions required by the Chrome Web Store dashboard. Use real-looking but non-sensitive sample rules and tabs.

1. **Main popup and group list**
   - Show three groups with different colors and target-site chips.
   - Caption: `Organize tabs with simple site-based rules.`

2. **Drag reordering**
   - Show one row being dragged with the insertion indicator visible.
   - Caption: `Drag groups to change priority and browser order.`

3. **Group editor**
   - Show name, target sites, scope selector, and Chrome color choices.
   - Caption: `Create precise rules without editing configuration files.`

4. **Conflict and match feedback**
   - Show an overlap warning and the current tab's matched target.
   - Caption: `Understand why tabs match and catch overlapping rules.`

5. **Chrome tab bar result**
   - Show AutoGrouping-owned groups arranged in rule order, followed by unmatched tabs.
   - Caption: `Keep managed groups ordered while leaving external groups alone.`

## Publication links

Copy these public HTTPS URLs into the Chrome Web Store dashboard:

- **Privacy policy:** `https://github.com/marutyan/autogrouping/blob/main/PRIVACY.md`
- **Support:** `https://github.com/marutyan/autogrouping/issues`
- **Source code:** `https://github.com/marutyan/autogrouping`

Do not mark the dashboard step complete until the URLs have been entered and verified in the submitted listing.

## Release notes draft for 0.1.0

Initial pre-release of AutoGrouping:

- site-based automatic tab grouping
- ordered groups and automatic tab-group sorting
- Split View and external-group protection
- popup-based rule editing, inline colors, conflict warnings, and Undo
- local-only processing with no analytics or telemetry
