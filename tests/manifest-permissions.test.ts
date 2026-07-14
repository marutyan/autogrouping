import { describe, expect, it } from "vitest";
import config from "../wxt.config";

const requiredPermissions = ["storage", "tabs", "tabGroups", "contextMenus"];

type AuditedManifest = {
  permissions?: string[];
  optional_permissions?: string[];
  host_permissions?: string[];
  optional_host_permissions?: string[];
};

describe("manifest permission audit", () => {
  const manifest = config.manifest as AuditedManifest;

  it("requests only the permissions required by current features", () => {
    expect(manifest.permissions).toEqual(requiredPermissions);
  });

  it("does not request optional or host permissions", () => {
    expect(manifest.optional_permissions).toBeUndefined();
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.optional_host_permissions).toBeUndefined();
  });
});
