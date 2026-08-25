import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = (process.env.PLAYWRIGHT_BASE_URL ?? "https://n50.nifty50today.co.in/n50").replace(/\/$/, "");
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
const outputDir = path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR ?? "output/playwright/canonical-feature-regression");
if (!password) throw new Error("PLAYWRIGHT_ADMIN_PASSWORD is required");
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const results = [];
const check = (name, passed, detail = "") => {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}: ${detail}`);
};

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const login = await context.request.post(`${baseUrl}/auth/session/dev-login`, { data: { identifier: "admin", password } });
  check("canonical browser-origin login", login.ok(), `status=${login.status()}`);
  const page = await context.newPage();
  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.getByText("NIFTY 50 TRADER", { exact: true }).waitFor();
  check("native cursor remains visible", await page.evaluate(() => getComputedStyle(document.documentElement).cursor !== "none"));
  check("target overlay remains mounted", await page.locator('[aria-hidden="true"][data-market-tone]').count() > 0);
  await page.getByRole("button", { name: /Connected/ }).click();
  const fontToggle = page.getByRole("menuitemcheckbox", { name: "High-legibility font" });
  await fontToggle.waitFor();
  await fontToggle.click();
  check("high-legibility mode applied", await page.evaluate(() => document.documentElement.dataset.fontMode === "high-legibility"));
  await page.reload({ waitUntil: "domcontentloaded" });
  check("font preference survives reload", await page.evaluate(() => document.documentElement.dataset.fontMode === "high-legibility"));
  check("Atkinson resolves", await page.evaluate(() => getComputedStyle(document.body).fontFamily.includes("Atkinson")));
  await page.getByRole("button", { name: /Paper trade notifications/ }).waitFor({ timeout: 30_000 });
  check("Paper alerts launcher", await page.getByRole("button", { name: /Paper trade notifications/ }).isVisible());
  await page.getByLabel(/NIFTY 50/).first().waitFor({ timeout: 30_000 });
  check("NIFTY ticker", await page.getByLabel(/NIFTY 50/).first().isVisible());
  await page.screenshot({ path: path.join(outputDir, "canonical-home.png") });
  await context.close();
} finally {
  await browser.close();
  await fs.writeFile(path.join(outputDir, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
}

console.log(JSON.stringify({ checks: results.length, passed: results.filter((row) => row.passed).length, outputDir }, null, 2));
