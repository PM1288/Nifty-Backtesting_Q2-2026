import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const origin = (process.env.PLAYWRIGHT_ORIGIN ?? "http://127.0.0.1:19090").replace(/\/$/, "");
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
const outputDir = path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR ?? "output/playwright/monthly-evaluation-ledger-20260823");
if (!password) throw new Error("PLAYWRIGHT_ADMIN_PASSWORD is required");
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const results = [];
const check = (name, passed, detail = "") => {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}: ${detail}`);
};

try {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, reducedMotion: "reduce" });
  const login = await context.request.post(`${origin}/n50/auth/session/dev-login`, { data: { identifier: "admin", password } });
  check("authenticated", login.ok(), `status=${login.status()}`);
  const page = await context.newPage();
  const failures = [];
  page.on("response", (response) => { if (response.status() >= 400 && /\/n50\/(v1|auth)\//.test(response.url())) failures.push(`${response.status()} ${response.url()}`); });
  await page.goto(`${origin}/n50/strategy/monthly`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.getByRole("heading", { name: "Monthly Strategy", exact: true }).waitFor({ timeout: 120_000 });
  await page.locator("label").filter({ hasText: /^Entry method/ }).locator("select").selectOption("MONTHLY_CLOSURE");
  await page.locator("label").filter({ hasText: /^Year/ }).locator("select").selectOption("2026");
  await page.locator("label").filter({ hasText: /^Month/ }).locator("select").selectOption("08");
  const responsePromise = page.waitForResponse((response) => response.url().includes("/v1/rolling-monthly/evaluation-ledger") && response.ok(), { timeout: 120_000 });
  await page.getByLabel("Stock population").selectOption("ALL_EVALUATED");
  const response = await responsePromise;
  const payload = await response.json();
  check("API totals", payload.summary.filtered === 268 && payload.summary.selected === 40 && payload.summary.rejected === 228 && payload.summary.incomplete === 0, JSON.stringify(payload.summary));
  await page.getByText("Absolute: 40 selected · 228 rejected · 0 incomplete", { exact: true }).waitFor({ timeout: 120_000 });
  check("all rows rendered", await page.locator("tbody tr").count() === 268, `rows=${await page.locator("tbody tr").count()}`);
  check("rejected rows rendered", await page.locator('tbody tr[data-selection="REJECTED"]').count() === 228, `rejected=${await page.locator('tbody tr[data-selection="REJECTED"]').count()}`);
  check("rejected targets are not eligible", await page.locator('tbody tr[data-selection="REJECTED"]').first().getByText("NOT ELIGIBLE", { exact: false }).count() === 3, "rejected targets rendered as outcomes");
  await page.locator('tbody tr[data-selection="REJECTED"]').first().click();
  await page.getByRole("heading", { name: /Selection decision · REJECTED/ }).waitFor();
  check("failed conditions visible", await page.locator("aside li[data-pass=false]").count() > 0, "no failed scanner gates");
  check("no API failures", failures.length === 0, failures.join(" | "));
  check("no page overflow", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), "viewport-level horizontal overflow");
  await page.screenshot({ path: path.join(outputDir, "absolute-all-evaluated-1366x768.png"), fullPage: true, animations: "disabled" });
  await context.close();
} finally {
  await browser.close();
  await fs.writeFile(path.join(outputDir, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
}

console.log(JSON.stringify({ checks: results.length, passed: results.filter((row) => row.passed).length, outputDir }, null, 2));
