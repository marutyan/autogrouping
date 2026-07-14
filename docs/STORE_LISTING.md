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

Reads tab URLs and grouping state so rules can be evaluated, and moves or ungroups tabs when applying those rules. Observed tab URLs are not stored as browsing history or transmitted to the developer. AutoGrouping does not read page contents.

### `tabGroups`

Creates, updates, colors, and reorders Chrome tab groups owned by AutoGrouping.

### `contextMenus`

Provides manual tab actions, including protecting a tab, returning it to automation, and re-evaluating the current window.

AutoGrouping requests no host permissions, optional permissions, or access to website contents.

## Privacy practices dashboard worksheet

Use the current Chrome Web Store dashboard labels at submission time, but keep the following implementation facts consistent across the dashboard, privacy policy, listing, and source code.

### User data categories

- **Web history / web browsing activity:** Handled locally. AutoGrouping reads the URL of an open tab only to evaluate user-defined grouping rules. Observed tab URLs are not retained as browsing history, transmitted to the developer, or shared with another party.
- **User-provided configuration:** User-created group names, colors, order, and URL patterns are stored in Chrome extension storage. Chrome may synchronize these settings through the user's signed-in Chrome profile. The developer does not receive them.
- **Personally identifiable information:** Not handled.
- **Health information:** Not handled.
- **Financial and payment information:** Not handled.
- **Authentication information:** Not handled.
- **Personal communications:** Not handled.
- **Location:** Not handled.
- **User activity such as clicks, keystrokes, or scrolling:** Not handled.
- **Website content:** Not handled. AutoGrouping does not inspect page text, forms, cookies, messages, or screenshots.

### Use and transfer declarations

- **Single-purpose use:** Tab URLs and tab state are used only for the disclosed tab-grouping feature.
- **Data sale or transfer:** None.
- **Advertising or profiling:** None.
- **Analytics or telemetry:** None.
- **Human access to user data:** None; AutoGrouping has no backend or developer-accessible data store.
- **Remote code:** None.
- **Limited Use certification:** AutoGrouping's Chrome API data use is limited to its disclosed user-facing functionality and complies with the Chrome Web Store Limited Use requirements.

Do not answer that web browsing activity is absent merely because processing is local. Chrome Web Store policy requires disclosure of local handling as well as transmission. Re-check the final dashboard wording and compare every answer against `PRIVACY.md` before publication.

## Screenshot plan

Chrome Web Store screenshots must use square outer corners and full-bleed presentation at exactly `1280x800` or `640x400` pixels. Use `1280x800` unless the downscaled result becomes difficult to read. Official requirements: `https://developer.chrome.com/docs/webstore/images#screenshots`.

Use real-looking but non-sensitive sample rules and tabs.

The CI artifact `autogrouping-store-screenshots` automatically generates these `1280x800` candidates:

- `01-main-popup.png`
- `02-group-editor.png`
- `03-inline-color-picker.png`
- `04-drag-reordering.png`

Capture browser-dependent states, especially the Chrome tab bar and a real current-tab match, manually at `1280x800`.

1. **Main popup and group list**
   - Show three groups with different colors and target-site chips.
   - Caption: `Organize tabs with simple site-based rules.`

2. **Drag reordering**
   - Show one row being dragged with the insertion indicator visible.
   - The CI-generated candidate reproduces this state without committing the drop.
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

## Small promotional image

Chrome Web Store publication also requires one small promotional image at exactly `440x280` pixels. It should use square outer corners, avoid screenshots of sensitive browser content, and remain legible at card size. Official requirements: `https://developer.chrome.com/docs/webstore/images#small-promo-tile`.

The CI artifact `autogrouping-store-promo` generates:

- `small-promo-440x280.png`

The generated image uses the existing AutoGrouping icon and abstract tab-group graphics only. Review the final PNG at native size before uploading it to the store dashboard.

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
