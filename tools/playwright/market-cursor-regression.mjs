import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const origin = (process.env.PLAYWRIGHT_ORIGIN ?? "http://127.0.0.1:19090").replace(/\/$/, "");
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
const outputDir = path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR ?? "output/playwright/market-cursors-20260818");
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
  // This is a streaming application; waiting for networkidle can never settle
  // while the authenticated event stream is active.
  await page.goto(`${origin}/n50/?prefetch=off`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const targetCursor = page.locator("[data-market-target-cursor='true']");
  await targetCursor.waitFor({ state: "attached", timeout: 60_000 });
  check("only target cursor layer mounted", await page.locator("canvas[data-market-splash-cursor='true']").count() === 0 && await targetCursor.count() === 1, "smoke canvas remains or target is missing");

  await page.mouse.move(650, 420);
  await page.mouse.down();
  await page.waitForTimeout(80);
  await page.mouse.up();
  check("desktop native cursor remains visible", await page.evaluate(() => document.documentElement.classList.contains("n50-target-cursor-enabled") && getComputedStyle(document.body).cursor !== "none"), "native cursor was hidden");

  const today = page.getByRole("link", { name: "Today", exact: true });
  const todayBox = await today.boundingBox();
  if (!todayBox) throw new Error("Today target has no box");
  await page.mouse.move(todayBox.x + todayBox.width / 2, todayBox.y + todayBox.height / 2);
  await page.waitForTimeout(450);
  const snapped = await targetCursor.evaluate((node) => ({
    snapped: node.getAttribute("data-snapped"),
    width: node.getBoundingClientRect().width,
    height: node.getBoundingClientRect().height,
    opacity: Number(getComputedStyle(node).opacity),
  }));
  const snapTolerance = 2;
  check("target cursor snaps to navigation", snapped.snapped === "true" && snapped.width + snapTolerance >= todayBox.width && snapped.height + snapTolerance >= todayBox.height && snapped.opacity > 0.9, JSON.stringify({ todayBox, snapped }));
  check("native pointer remains visible over active target", await today.evaluate((node) => node.classList.contains("n50-target-cursor-active") && getComputedStyle(node).cursor === "pointer"), "target class/native pointer missing");
  await page.screenshot({ path: path.join(outputDir, "target-cursor-snapped-1366x768.png") });

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForTimeout(100);
  await page.mouse.move(todayBox.x + todayBox.width / 2, todayBox.y + todayBox.height / 2);
  check("reduced motion keeps the target pointer without interpolation", await targetCursor.evaluate((node) => getComputedStyle(node).display !== "none" && Number(getComputedStyle(node).opacity) > 0), "target disappeared in reduced motion");
  await context.close();
} finally {
  await browser.close();
  await fs.writeFile(path.join(outputDir, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
}

console.log(JSON.stringify({ checks: results.length, passed: results.filter((item) => item.passed).length, outputDir }, null, 2));
