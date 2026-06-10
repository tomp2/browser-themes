"use strict";

const puppeteer = require("puppeteer");
const sharp = require("sharp");
const path = require("path");

const SIZES = [16, 32, 48, 96, 128];
const RENDER_SIZE = 256;
const IMAGES_DIR = path.join(__dirname, "src", "images");
const HTML = `file:///${path.resolve(__dirname, "icon-generator.html").replace(/\\/g, "/")}`;

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  await page.setViewport({ width: RENDER_SIZE, height: RENDER_SIZE });
  await page.goto(HTML, { waitUntil: "load" });

  await page.evaluate(() => {
    document.body.style.background = "transparent";
  });

  const buffer = await page.screenshot({
    omitBackground: true,
    clip: { x: 0, y: 0, width: RENDER_SIZE, height: RENDER_SIZE },
  });

  await browser.close();

  for (const size of SIZES) {
    const out = path.join(IMAGES_DIR, `icon-${size}.png`);
    await sharp(buffer).resize(size, size).png().toFile(out);
    console.log(`saved icon-${size}.png`);
  }
})();
