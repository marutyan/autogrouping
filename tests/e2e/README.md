# End-to-end extension tests

The Playwright suite builds and loads `.output/chrome-mv3` as an unpacked MV3 extension in the bundled Chromium channel.

Covered scenarios:

- popup rendering and rule-conflict feedback
- React drag handles and removal of the separate settings page
- external group preservation
- automatic resumption after leaving an external group, including one-tab group removal
- removal from an AutoGrouping group after the URL no longer matches

The grouping scenario uses a local HTTP server and mapped `.localhost` hostnames, so it does not depend on public network access. Test rules are written only after the background controller confirms that its runtime listener is ready.

Split View remains a Stable/Beta manual regression because Playwright does not expose a reliable Split View control surface.

Run locally:

```bash
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```
