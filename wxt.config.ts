import { defineConfig } from "wxt";
import packageJson from "./package.json";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "AutoGrouping",
    description:
      "Automatically organize tabs while preserving Split View and externally managed groups.",
    version: packageJson.version,
    minimum_chrome_version: "120",
    permissions: ["storage", "tabs", "tabGroups", "contextMenus"],
    icons: {
      16: "icon/16.png",
      32: "icon/32.png",
      48: "icon/48.png",
      128: "icon/128.png",
    },
    action: {
      default_title: "AutoGrouping",
      default_icon: {
        16: "icon/16.png",
        32: "icon/32.png",
        48: "icon/48.png",
        128: "icon/128.png",
      },
    },
  },
});
