import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const origin = (process.env.PLAYWRIGHT_ORIGIN ?? "http://127.0.0.1:19090").replace(/\/$/, "");
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
const outputDir = path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR ?? "output/playwright/market-rsi-particles-20260818");
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
  const login = await context.request.post(`${origin}/n50/auth/session/dev-login`, { data: { identifier: "admin", password } });
  check("admin login", login.ok(), `status=${login.status()}`);
  const page = await context.newPage();
  await page.goto(`${origin}/n50/?prefetch=off`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  // Ambient animation was removed in the production UI cleanup. Preserve that
  // decision while checking the operational ticker and target cursor remain.
  for (const route of ["/", "/paper-trading"]) {
    await page.goto(`${origin}/n50${route}`, { waitUntil: "domcontentloaded" });
    await page.locator("main").waitFor();
    check(`no decorative particles on ${route}`, await page.locator("canvas[data-market-rsi-particles='true']").count() === 0);
    check(`target cursor retained on ${route}`, await page.locator('[aria-hidden="true"][data-market-tone]').count() > 0);
    await page.getByLabel(/NIFTY 50/).first().waitFor({ timeout: 30_000 });
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  check("reduced motion has no ambient canvas", await page.locator("canvas[data-market-rsi-particles='true']").count() === 0);
  await context.close();
} finally {
  await browser.close();
  await fs.writeFile(path.join(outputDir, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
}

console.log(JSON.stringify({ checks: results.length, passed: results.filter((item) => item.passed).length, outputDir }, null, 2));
