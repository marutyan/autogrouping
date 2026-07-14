import { describe, expect, it } from "vitest";
import { readPngDimensions, verifyPngDimensions } from "../scripts/store-assets.mjs";

function pngHeader(width, height) {
  const buffer = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(buffer, 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

describe("store asset validation", () => {
  it("reads PNG dimensions from the IHDR chunk", () => {
    expect(readPngDimensions(pngHeader(1280, 800))).toEqual({ width: 1280, height: 800 });
  });

  it("accepts the expected dimensions", () => {
    expect(verifyPngDimensions(pngHeader(440, 280), 440, 280, "promo.png")).toEqual({
      width: 440,
      height: 280,
    });
  });

  it("rejects an incorrectly sized asset", () => {
    expect(() => verifyPngDimensions(pngHeader(640, 400), 1280, 800, "shot.png")).toThrow(
      "shot.png is 640x400; expected 1280x800.",
    );
  });

  it("rejects invalid PNG data", () => {
    expect(() => readPngDimensions(Buffer.alloc(24))).toThrow(
      "File does not have a valid PNG signature.",
    );
  });
});
