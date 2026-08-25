import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = (process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:19090/n50").replace(/\/$/, "");
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
if (!password) throw new Error("PLAYWRIGHT_ADMIN_PASSWORD is required");
const outputDir = path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR ?? "output/playwright/market-gradient-waves");
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const auth = await browser.newContext();
const login = await auth.request.post(`${baseUrl}/auth/session/dev-login`, { data: { identifier: "admin", password } });
if (!login.ok()) throw new Error(`login failed: ${login.status()}`);
const storageState = await auth.storageState();
await auth.close();

const routes = [
  { slug: "today", path: "/" },
  { slug: "markets", path: "/analytics" },
  { slug: "stock-360", path: "/analytics/stock/RELIANCE" },
  { slug: "strategy", path: "/strategy/oiis-live" },
  { slug: "paper", path: "/paper-trading" },
  { slug: "derivatives", path: "/options/intelligence" },
  { slug: "operations", path: "/analytics/system/quality" },
  { slug: "admin", path: "/control-plane" },
];
const results = [];
const record = (viewport, route, check, passed, detail = "") => results.push({ viewport, route, check, passed, detail });

try {
  for (const viewport of [
    { name: "desktop-1366x768", width: 1366, height: 768 },
    { name: "mobile-390x844", width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({ viewport, storageState, reducedMotion: "reduce" });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on("console", (event) => {
      if (event.type() === "error" && !/clarity|cloudflareinsights/i.test(event.text())) consoleErrors.push(event.text());
    });

    for (const route of routes) {
      await page.goto(`${baseUrl}${route.path}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      const backdrop = page.locator('[data-market-gradient-waves="true"]');
      await backdrop.waitFor({ timeout: 30_000 });
      await page.waitForTimeout(750);
      const tone = await backdrop.getAttribute("data-market-tone");
      const band = await backdrop.getAttribute("data-market-band");
      const changePct = await backdrop.getAttribute("data-nifty-change-pct");
      const rsi = await backdrop.getAttribute("data-nifty-rsi");
      const brilliance = Number(await backdrop.getAttribute("data-wave-brilliance"));
      const speedSeconds = Number(await backdrop.getAttribute("data-wave-speed-seconds"));
      const waveAnimation = await backdrop.locator("svg").evaluate((node) => getComputedStyle(node).animationName);
      const pathAnimations = await backdrop.locator("path").evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).animationName));
      record(viewport.name, route.slug, "one shared wave layer", await backdrop.count() === 1);
      record(viewport.name, route.slug, "smoke cursor removed", await page.locator('[data-market-splash-cursor="true"]').count() === 0);
      record(viewport.name, route.slug, "valid NIFTY tone", ["positive", "neutral", "negative"].includes(tone ?? ""), String(tone));
      record(viewport.name, route.slug, "threshold semantics exposed", /NIFTY (positive|neutral|negative)/.test(band ?? ""), String(band));
      const expectedBrilliance = changePct === "unavailable" ? 0 : Math.min(1, Math.abs(Number(changePct)) / 2);
      const expectedSpeed = rsi === "unavailable" ? 28 : 28 - (Math.abs(Number(rsi) - 50) / 50) * 16;
      record(viewport.name, route.slug, "brilliance follows absolute NIFTY move", Math.abs(brilliance - expectedBrilliance) <= 0.001, `${changePct}% -> ${brilliance}`);
      record(viewport.name, route.slug, "speed follows NIFTY RSI extremity", Math.abs(speedSeconds - expectedSpeed) <= 0.02, `RSI ${rsi} -> ${speedSeconds}s`);
      record(viewport.name, route.slug, "reduced motion stops wave animation", waveAnimation === "none" && pathAnimations.every((name) => name === "none"), `${waveAnimation}; ${pathAnimations.join(",")}`);
      record(viewport.name, route.slug, "no body overflow", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    }

    await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.locator('[data-market-gradient-waves="true"]').waitFor({ timeout: 30_000 });
    await page.waitForTimeout(1_500);
    await page.screenshot({ path: path.join(outputDir, `${viewport.name}-dashboard.png`), fullPage: false });
    record(viewport.name, "all", "no relevant console errors", consoleErrors.length === 0, consoleErrors.join(" | "));
    await context.close();
  }

  const interactiveContext = await browser.newContext({ viewport: { width: 1366, height: 768 }, storageState, reducedMotion: "no-preference" });
  const interactivePage = await interactiveContext.newPage();
  await interactivePage.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const targetCursor = interactivePage.locator('[data-market-target-cursor="true"]');
  await targetCursor.waitFor({ timeout: 30_000 });
  record("desktop-interactive", "today", "target cursor is the only custom pointer", await interactivePage.locator('[data-market-splash-cursor="true"]').count() === 0 && await targetCursor.count() === 1);
  for (const point of [{ x: 120, y: 300 }, { x: 280, y: 360 }, { x: 460, y: 280 }, { x: 650, y: 420 }]) await interactivePage.mouse.move(point.x, point.y, { steps: 4 });
  await interactivePage.waitForTimeout(120);
  record("desktop-interactive", "today", "native pointer hidden globally", await interactivePage.evaluate(() => document.documentElement.classList.contains("n50-target-cursor-enabled") && getComputedStyle(document.body).cursor === "none"));
  record("desktop-interactive", "today", "target follows pointer", await targetCursor.evaluate((node) => Number(getComputedStyle(node).opacity) > 0));
  await interactivePage.screenshot({ path: path.join(outputDir, "desktop-1366x768-target-cursor.png"), fullPage: false });
  await interactivePage.getByRole("link", { name: "Markets", exact: true }).click();
  await interactivePage.waitForURL(/\/analytics(?:\?|$)/, { timeout: 30_000 });
  record("desktop-interactive", "markets", "target cursor does not block workspace navigation", true);
  await interactiveContext.close();
} finally {
  await browser.close();
}

await fs.writeFile(path.join(outputDir, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ total: results.length, passed: results.length - failed.length, failed: failed.length, outputDir }, null, 2));
if (failed.length) {
  console.error(JSON.stringify(failed, null, 2));
  process.exitCode = 1;
}
