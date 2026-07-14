import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test } from "./fixtures";

const promoDirectory = path.join(process.cwd(), "artifacts", "store-promo");
const promoSize = { width: 440, height: 280 } as const;

test("generates the required Chrome Web Store small promotional image", async ({
  page,
  extensionId,
}) => {
  mkdirSync(promoDirectory, { recursive: true });
  await page.setViewportSize(promoSize);
  await page.goto(`chrome-extension://${extensionId}/popup.html`);

  await page.setContent(`
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>AutoGrouping small promotional image</title>
        <style>
          * {
            box-sizing: border-box;
          }

          html,
          body {
            width: 440px;
            height: 280px;
            margin: 0;
            overflow: hidden;
          }

          body {
            position: relative;
            display: grid;
            grid-template-columns: 172px 1fr;
            align-items: center;
            padding: 34px 36px;
            color: #f1f3f4;
            background:
              radial-gradient(circle at 20% 15%, rgb(138 180 248 / 18%), transparent 36%),
              linear-gradient(145deg, #111214 0%, #202124 58%, #18191b 100%);
            font-family: Inter, ui-sans-serif, system-ui, sans-serif;
          }

          .brand {
            display: grid;
            justify-items: start;
            gap: 14px;
          }

          .icon-frame {
            display: grid;
            width: 104px;
            height: 104px;
            place-items: center;
          }

          .icon-frame img {
            display: block;
            width: 104px;
            height: 104px;
          }

          .name {
            margin: 0;
            font-size: 25px;
            font-weight: 700;
            letter-spacing: -0.04em;
          }

          .tabs {
            position: relative;
            display: grid;
            gap: 13px;
            width: 196px;
          }

          .window-bar {
            display: flex;
            gap: 6px;
            margin-bottom: 6px;
          }

          .window-bar span {
            width: 7px;
            height: 7px;
            border-radius: 50%;
            background: #5f6368;
          }

          .group {
            position: relative;
            height: 42px;
            border: 1px solid #3c4043;
            border-radius: 11px;
            background: rgb(41 42 45 / 92%);
            box-shadow: 0 10px 24px rgb(0 0 0 / 22%);
          }

          .group::before {
            position: absolute;
            top: 10px;
            left: 12px;
            width: 9px;
            height: 22px;
            border-radius: 5px;
            background: var(--accent);
            content: "";
          }

          .group::after {
            position: absolute;
            top: 12px;
            right: 13px;
            width: 144px;
            height: 18px;
            border-radius: 6px;
            background:
              linear-gradient(
                90deg,
                rgb(232 234 237 / 74%) 0 43%,
                transparent 43% 49%,
                rgb(154 160 166 / 48%) 49% 72%,
                transparent 72%
              );
            content: "";
          }

          .blue {
            --accent: #8ab4f8;
            transform: translateX(-8px);
          }

          .purple {
            --accent: #c58af9;
            transform: translateX(4px);
          }

          .cyan {
            --accent: #78d9ec;
            transform: translateX(-2px);
          }

          .flow {
            position: absolute;
            right: 28px;
            bottom: 21px;
            width: 70px;
            height: 2px;
            background: linear-gradient(90deg, transparent, #8ab4f8);
            opacity: 0.7;
          }

          .flow::after {
            position: absolute;
            top: -4px;
            right: 0;
            width: 9px;
            height: 9px;
            border-top: 2px solid #8ab4f8;
            border-right: 2px solid #8ab4f8;
            transform: rotate(45deg);
            content: "";
          }
        </style>
      </head>
      <body>
        <section class="brand" aria-label="AutoGrouping brand">
          <div class="icon-frame">
            <img src="chrome-extension://${extensionId}/icon/128.png" alt="" />
          </div>
          <h1 class="name">AutoGrouping</h1>
        </section>
        <section class="tabs" aria-label="Organized tab groups">
          <div class="window-bar" aria-hidden="true"><span></span><span></span><span></span></div>
          <div class="group blue"></div>
          <div class="group purple"></div>
          <div class="group cyan"></div>
        </section>
        <div class="flow" aria-hidden="true"></div>
      </body>
    </html>
  `);

  await expect(page.locator(".icon-frame img")).toHaveJSProperty("complete", true);
  expect(page.viewportSize()).toEqual(promoSize);

  await page.screenshot({
    path: path.join(promoDirectory, "small-promo-440x280.png"),
    animations: "disabled",
  });
});
