import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export const STORE_ASSETS = [
  ["artifacts/store-screenshots/01-main-popup.png", 1280, 800],
  ["artifacts/store-screenshots/02-group-editor.png", 1280, 800],
  ["artifacts/store-screenshots/03-inline-color-picker.png", 1280, 800],
  ["artifacts/store-screenshots/04-drag-reordering.png", 1280, 800],
  ["artifacts/store-promo/small-promo-440x280.png", 440, 280],
];

export function readPngDimensions(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 24) {
    throw new Error("PNG data is too short to contain an IHDR chunk.");
  }
  if (!buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error("File does not have a valid PNG signature.");
  }
  if (buffer.toString("ascii", 12, 16) !== "IHDR") {
    throw new Error("PNG does not begin with an IHDR chunk.");
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

export function verifyPngDimensions(buffer, expectedWidth, expectedHeight, label = "PNG") {
  const dimensions = readPngDimensions(buffer);
  if (dimensions.width !== expectedWidth || dimensions.height !== expectedHeight) {
    throw new Error(
      `${label} is ${dimensions.width}x${dimensions.height}; expected ${expectedWidth}x${expectedHeight}.`,
    );
  }
  return dimensions;
}

export function verifyStoreAssets(rootDirectory = process.cwd()) {
  return STORE_ASSETS.map(([relativePath, expectedWidth, expectedHeight]) => {
    const absolutePath = resolve(rootDirectory, relativePath);
    const dimensions = verifyPngDimensions(
      readFileSync(absolutePath),
      expectedWidth,
      expectedHeight,
      relativePath,
    );
    return { relativePath, ...dimensions };
  });
}

function main() {
  try {
    const verified = verifyStoreAssets();
    for (const asset of verified) {
      console.log(`Verified ${asset.relativePath}: ${asset.width}x${asset.height}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`::error::${message}`);
    process.exitCode = 1;
  }
}

const executedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (executedPath === import.meta.url) main();
