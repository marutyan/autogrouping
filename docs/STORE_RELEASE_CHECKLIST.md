# Chrome Web Store release checklist

- [x] Independent AutoGrouping name and original icon.
- [x] Production icons in 16, 32, 48, and 128 px sizes.
- [x] Concise store listing copy prepared in `docs/STORE_LISTING.md`.
- [ ] Store screenshots captured and reviewed for sensitive information.
- [x] No analytics, remote code, external API, advertising, or telemetry.
- [x] Permissions limited to storage, tabs, tabGroups, and contextMenus.
- [x] Permission justifications and privacy-practice draft prepared.
- [x] Privacy policy drafted in `PRIVACY.md`.
- [ ] Privacy policy published at a stable public HTTPS URL and linked in the store dashboard.
- [x] Single-purpose description explains rule-based tab grouping.
- [ ] Stable and Beta manual regression complete.
- [ ] Split View regression complete on a supported Chrome release.
- [ ] Browser-agent external-group regression complete.
- [ ] Release ZIP generated from a clean tagged commit with SHA-256 checksum.
- [ ] Source, manifest, and store versions match.