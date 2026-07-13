# Existing rule migration

Chrome isolates extension storage by extension ID, so AutoGrouping cannot directly read rules stored by another installed extension.

## Export the existing `groupRules` value

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Open the service-worker inspector for the existing grouping extension.
4. Run the following command in the Console:

```js
chrome.storage.sync.get("groupRules", ({ groupRules }) => {
  copy(JSON.stringify({ groupRules }, null, 2));
});
```

5. Paste the copied value into a file ending in `.json`.
6. Open AutoGrouping options and choose **Import**.
7. Review every converted rule, then save.
8. Disable the previous grouping extension before enabling normal AutoGrouping use.

## Supported legacy fields

AutoGrouping recognizes the common legacy fields `id`, `name`, `color`, `pattern`, and `key`. A multi-line or space-separated `pattern` value is converted into the `patterns` array.
