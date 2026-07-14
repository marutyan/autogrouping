import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const defaultPackagePath = resolve(scriptDirectory, "../package.json");

export function readPackageVersion(packagePath = defaultPackagePath) {
  const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
  if (typeof packageJson.version !== "string" || packageJson.version.length === 0) {
    throw new Error(`Missing valid version in ${packagePath}`);
  }
  return packageJson.version;
}

export function expectedReleaseTag(version) {
  return `v${version}`;
}

export function verifyReleaseTag(tag, version) {
  const expectedTag = expectedReleaseTag(version);
  if (tag !== expectedTag) {
    throw new Error(
      `Release tag ${tag || "<missing>"} does not match package version ${version} (expected ${expectedTag}).`,
    );
  }
  return expectedTag;
}

function main() {
  const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME ?? "";
  const version = readPackageVersion();

  try {
    const expectedTag = verifyReleaseTag(tag, version);
    console.log(`Release tag ${expectedTag} matches package version ${version}.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`::error::${message}`);
    process.exitCode = 1;
  }
}

const executedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (executedPath === import.meta.url) main();
