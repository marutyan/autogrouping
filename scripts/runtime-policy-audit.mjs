import { readFileSync, readdirSync } from "node:fs";
import { extname, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const runtimeRoots = ["src", "entrypoints"];
const runtimeFiles = ["wxt.config.ts"];
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".html", ".css"]);

export const RUNTIME_POLICY_RULES = [
  { name: "network: fetch", pattern: /\bfetch\s*\(/ },
  { name: "network: XMLHttpRequest", pattern: /\bXMLHttpRequest\b/ },
  { name: "network: WebSocket", pattern: /\bWebSocket\s*\(/ },
  { name: "network: EventSource", pattern: /\bEventSource\s*\(/ },
  { name: "network: sendBeacon", pattern: /\bnavigator\.sendBeacon\s*\(/ },
  { name: "dynamic code: eval", pattern: /\beval\s*\(/ },
  { name: "dynamic code: Function constructor", pattern: /\bnew\s+Function\s*\(/ },
  { name: "remote code: importScripts", pattern: /\bimportScripts\s*\(/ },
  {
    name: "remote code: dynamic import",
    pattern: /\bimport\s*\(\s*["']https?:\/\//,
  },
  {
    name: "remote code: script source",
    pattern: /<script[^>]+\bsrc\s*=\s*["']https?:\/\//i,
  },
  {
    name: "remote code: stylesheet import",
    pattern: /@import\s+(?:url\()?\s*["']?https?:\/\//i,
  },
];

export function findRuntimePolicyViolations(source, filePath = "source") {
  const violations = [];
  for (const rule of RUNTIME_POLICY_RULES) {
    const match = rule.pattern.exec(source);
    if (!match || match.index === undefined) continue;
    const line = source.slice(0, match.index).split("\n").length;
    violations.push({ filePath, line, rule: rule.name });
  }
  return violations;
}

export function collectRuntimeSourceFiles(rootDirectory = process.cwd()) {
  const files = runtimeFiles.map((filePath) => resolve(rootDirectory, filePath));
  for (const root of runtimeRoots) collectDirectory(resolve(rootDirectory, root), files);
  return files.sort();
}

export function auditRuntimeSources(rootDirectory = process.cwd()) {
  const files = collectRuntimeSourceFiles(rootDirectory);
  const violations = files.flatMap((absolutePath) => {
    const filePath = relative(rootDirectory, absolutePath);
    return findRuntimePolicyViolations(readFileSync(absolutePath, "utf8"), filePath);
  });
  if (violations.length > 0) {
    const details = violations
      .map((violation) => `${violation.filePath}:${violation.line} ${violation.rule}`)
      .join("\n");
    throw new Error(`Runtime policy audit failed:\n${details}`);
  }
  return files.map((filePath) => relative(rootDirectory, filePath));
}

function collectDirectory(directory, files) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      collectDirectory(absolutePath, files);
      continue;
    }
    if (entry.isFile() && sourceExtensions.has(extname(entry.name))) files.push(absolutePath);
  }
}

function main() {
  try {
    const files = auditRuntimeSources();
    console.log(`Runtime policy audit passed for ${files.length} source files.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`::error::${message}`);
    process.exitCode = 1;
  }
}

const executedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (executedPath === import.meta.url) main();
