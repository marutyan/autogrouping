# AutoGrouping

A modern Chrome extension for rule-based tab grouping that preserves Chrome Split View and tabs managed by users, browser agents, and other extensions.

## Principles

- Only manage groups created by AutoGrouping.
- Never take tabs from externally managed groups.
- Keep externally managed tabs protected until they are closed or manually returned.
- Avoid all group mutations while a tab is in Split View.
- Keep all configuration and runtime state local to Chrome storage.
- Send no telemetry and use no remote service.

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
pnpm test:e2e
```

## Status

Pre-release. The first milestone focuses on Split View safety, external-group protection, deterministic rule matching, and import/export.
