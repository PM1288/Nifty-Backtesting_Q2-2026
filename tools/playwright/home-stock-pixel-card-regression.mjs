import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const origin = (process.env.PLAYWRIGHT_ORIGIN ?? "http://127.0.0.1:19090").replace(/\/$/, "");
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
const outputDir = path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR ?? "output/playwright/home-stock-pixel-card-20260818");
if (!password) throw new Error("PLAYWRIGHT_ADMIN_PASSWORD is required.");
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const results = [];
const check = (name, passed, detail = "") => {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}: ${detail}`);
};

try {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const login = await context.request.post(`${origin}/auth/session/dev-login`, { data: { identifier: "admin", password } });
  check("admin login", login.ok(), `status=${login.status()}`);
  const page = await context.newPage();
  await page.goto(`${origin}/n50/?prefetch=off`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const pills = page.locator("[data-stock-pill-symbol]");
  await pills.first().waitFor({ state: "visible", timeout: 60_000 });
  const visiblePillCount = await pills.count();
  const pixelFieldCount = await page.locator("[data-stock-pill-symbol] > canvas[data-stock-pixel-field='true']").count();
  check("every rendered stock pill owns a pixel field", visiblePillCount > 100 && pixelFieldCount === visiblePillCount, JSON.stringify({ visiblePillCount, pixelFieldCount }));

  const positive = page.locator("[data-stock-pill-symbol][data-lens-state='positive']").first();
  const negative = page.locator("[data-stock-pill-symbol][data-lens-state='negative']").first();
  check("positive and negative stocks available", await positive.count() === 1 && await negative.count() === 1, "market board did not expose both directions");

  await positive.hover();
  await page.waitForTimeout(520);
  const positivePixels = await positive.locator("canvas[data-stock-pixel-field='true']").evaluate((canvas) => {
    const context = canvas.getContext("2d");
    if (!context) return null;
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    let pixels = 0, red = 0, green = 0, blue = 0, maxAlpha = 0;
    for (let index = 0; index < image.data.length; index += 4) {
      maxAlpha = Math.max(maxAlpha, image.data[index + 3]);
      if (image.data[index + 3] <= 8) continue;
      pixels += 1; red += image.data[index]; green += image.data[index + 1]; blue += image.data[index + 2];
    }
    return { pixels, red: red / Math.max(1, pixels), green: green / Math.max(1, pixels), blue: blue / Math.max(1, pixels), maxAlpha, configuredMaxAlpha: Number(canvas.dataset.pixelMaxAlpha), tone: canvas.dataset.pixelTone };
  });
  check("positive stock reveals transparent green pixels", Boolean(positivePixels && positivePixels.pixels > 100 && positivePixels.green > positivePixels.red && positivePixels.maxAlpha <= 67 && positivePixels.configuredMaxAlpha === 0.26 && positivePixels.tone === "positive"), JSON.stringify(positivePixels));

  await negative.hover();
  await page.waitForTimeout(520);
  const negativePixels = await negative.locator("canvas[data-stock-pixel-field='true']").evaluate((canvas) => {
    const context = canvas.getContext("2d");
    if (!context) return null;
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    let pixels = 0, red = 0, green = 0, maxAlpha = 0;
    for (let index = 0; index < image.data.length; index += 4) {
      maxAlpha = Math.max(maxAlpha, image.data[index + 3]);
      if (image.data[index + 3] <= 8) continue;
      pixels += 1; red += image.data[index]; green += image.data[index + 1];
    }
    return { pixels, red: red / Math.max(1, pixels), green: green / Math.max(1, pixels), maxAlpha, configuredMaxAlpha: Number(canvas.dataset.pixelMaxAlpha), tone: canvas.dataset.pixelTone };
  });
  check("negative stock reveals transparent red pixels", Boolean(negativePixels && negativePixels.pixels > 100 && negativePixels.red > negativePixels.green && negativePixels.maxAlpha <= 67 && negativePixels.configuredMaxAlpha === 0.26 && negativePixels.tone === "negative"), JSON.stringify(negativePixels));
  await page.screenshot({ path: path.join(outputDir, "home-negative-stock-pixel-hover-1366x768.png") });

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForTimeout(100);
  check("reduced motion hides stock pixels", await negative.locator("canvas[data-stock-pixel-field='true']").evaluate((canvas) => getComputedStyle(canvas).display === "none"), "pixel field remains visible");
  await context.close();
} finally {
  await browser.close();
  await fs.writeFile(path.join(outputDir, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
}

console.log(JSON.stringify({ checks: results.length, passed: results.filter((item) => item.passed).length, outputDir }, null, 2));
