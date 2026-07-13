import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "AutoGrouping",
    description:
      "Automatically organize tabs while preserving Split View and externally managed groups.",
    version: "0.1.0",
    minimum_chrome_version: "120",
    permissions: ["storage", "tabs", "tabGroups", "contextMenus"],
    action: {
      default_title: "AutoGrouping",
    },
  },
});
