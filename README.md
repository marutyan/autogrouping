# AutoGrouping

A Chrome extension for rule-based tab grouping that preserves Chrome Split View and tabs managed by users, browser agents, and other extensions.

## Principles

- Only manage groups created by AutoGrouping.
- Never take tabs from externally managed groups.
- Resume automation automatically after a tab leaves an external group.
- Avoid group mutations while a tab is in Split View.
- Keep configuration and runtime state local to Chrome storage.
- Send no telemetry and use no remote service.

## Popup workflow

The popup is the complete configuration surface:

- create, edit, pause, and delete groups
- enter full domains or site keywords such as `github`
- reorder groups by dragging; the same order controls matching priority and tab-group position
- change Chrome group colors inline
- inspect overlapping rules and the current tab's match reason
- undo group deletion and reordering

Advanced wildcard patterns remain available inside each group editor. JSON import/export and the separate options page are intentionally not included.

## Privacy and store preparation

- [Privacy policy](PRIVACY.md)
- [Chrome Web Store listing draft](docs/STORE_LISTING.md)
- [Chrome Web Store release checklist](docs/STORE_RELEASE_CHECKLIST.md)

AutoGrouping processes tab URLs locally only to apply user-defined rules. It has no analytics, advertising, telemetry, remote backend, or user account.

## Development

Requirements: Node.js 24 LTS+, pnpm 11+, and a current Chrome installation.

```bash
corepack enable
pnpm install
pnpm dev
```

Load `.output/chrome-mv3` from `chrome://extensions` with Developer mode enabled.

## Validation

```bash
pnpm check
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
pnpm zip
```

The Playwright suite loads the unpacked extension and covers popup rendering, external-group preservation, automatic resumption, and URL mismatch removal. Split View remains a manual Chrome Stable/Beta regression.

## Status

Pre-release. The current milestone focuses on stable coexistence with Split View, Claude/browser agents, deterministic grouping, and a compact popup-only workflow.