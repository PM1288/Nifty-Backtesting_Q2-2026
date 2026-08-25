import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const origin = (process.env.PLAYWRIGHT_ORIGIN ?? "http://127.0.0.1:19090").replace(/\/$/, "");
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
const outputDir = path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR ?? "output/playwright/monthly-strategy-consolidation-20260823");
if (!password) throw new Error("PLAYWRIGHT_ADMIN_PASSWORD is required");
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const results = [];
function check(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}: ${detail}`);
}

try {
  for (const viewport of [
    { name: "desktop-1920x1080", width: 1920, height: 1080 },
    { name: "tablet-768x1024", width: 768, height: 1024 },
    { name: "mobile-390x844", width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({ viewport });
    const login = await context.request.post(`${origin}/n50/auth/session/dev-login`, { data: { identifier: "admin", password } });
    check(`${viewport.name} login`, login.ok(), `status=${login.status()}`);
    const page = await context.newPage();
    const failures = [];
    page.on("response", (response) => { if (response.status() >= 400 && /\/n50\/(v1|auth)\//.test(response.url())) failures.push(`${response.status()} ${response.url()}`); });
    await page.goto(`${origin}/n50/strategy/monthly`, { waitUntil: "networkidle", timeout: 120_000 });
    await page.getByRole("heading", { name: "Monthly Strategy", exact: true }).waitFor();
    check(`${viewport.name} three-method filter`, await page.getByLabel("Entry method").locator("option").count() === 4, "method options missing");
    check(`${viewport.name} unified ledger`, await page.getByRole("heading", { name: "All monthly entry methods in one table" }).count() === 1, "ledger missing");
    check(`${viewport.name} rows`, await page.locator("tbody tr").count() > 0, "no rows");
    check(`${viewport.name} stock identity`, await page.locator("tbody tr").first().locator("img").count() >= 1, "stock logo missing");
    const headerPosition = await page.locator("thead th").first().evaluate((node) => getComputedStyle(node).position);
    check(`${viewport.name} sticky header`, headerPosition === "sticky", `position=${headerPosition}`);
    check(`${viewport.name} no body overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), "body overflow");
    await page.locator("tbody tr").first().click();
    await page.getByRole("button", { name: "Close inspector" }).waitFor();
    check(`${viewport.name} inspector conditions`, await page.getByRole("heading", { name: "Entry conditions" }).count() === 1, "condition trace missing");
    await page.getByRole("button", { name: "Close inspector" }).click();
    await page.screenshot({ path: path.join(outputDir, `${viewport.name}-monthly.png`), fullPage: true });

    await page.goto(`${origin}/n50/strategy/rolling-monthly`, { waitUntil: "networkidle", timeout: 120_000 });
    await page.getByRole("heading", { name: "Rolling Strategy", exact: true }).waitFor();
    check(`${viewport.name} rolling rows`, await page.locator("tbody tr").count() > 0, "rolling rows missing");
    check(`${viewport.name} independent label`, await page.getByText("INDEPENDENT ROLLING RESEARCH", { exact: false }).count() === 1, "boundary missing");
    check(`${viewport.name} rolling no overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), "body overflow");
    check(`${viewport.name} API failures`, failures.length === 0, failures.join(" | "));
    await page.screenshot({ path: path.join(outputDir, `${viewport.name}-rolling.png`), fullPage: true });
    await context.close();
  }

  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const login = await context.request.post(`${origin}/n50/auth/session/dev-login`, { data: { identifier: "admin", password } });
  check("legacy login", login.ok(), `status=${login.status()}`);
  const page = await context.newPage();
  const auditFailures = [];
  page.on("response", (response) => { if (response.status() >= 400 && /\/n50\/(v1|auth)\//.test(response.url())) auditFailures.push(`${response.status()} ${response.url()}`); });
  await page.goto(`${origin}/n50/strategy/monthly`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.getByRole("heading", { name: "Monthly Strategy", exact: true }).waitFor({ timeout: 120_000 });
  await page.locator("label").filter({ hasText: /^Entry method/ }).locator("select").selectOption("MONTHLY_CLOSURE");
  await page.locator("label").filter({ hasText: /^Year/ }).locator("select").selectOption("2026");
  await page.locator("label").filter({ hasText: /^Month/ }).locator("select").selectOption("08");
  const ledgerResponse = page.waitForResponse((response) => response.url().includes("/v1/rolling-monthly/evaluation-ledger") && response.ok());
  await page.getByLabel("Stock population").selectOption("ALL_EVALUATED");
  await ledgerResponse;
  await page.getByText("Absolute: 40 selected · 228 rejected · 0 incomplete", { exact: true }).waitFor();
  check("all-stock absolute ledger", await page.locator('tbody tr[data-selection="REJECTED"]').count() > 0, "rejected stocks missing");
  check("all-stock ledger count", await page.locator("tbody tr").count() === 268, `rows=${await page.locator("tbody tr").count()}`);
  await page.locator('tbody tr[data-selection="REJECTED"]').first().click();
  await page.getByRole("heading", { name: /Selection decision · REJECTED/ }).waitFor();
  check("rejected condition trace", await page.locator("aside li[data-pass=false]").count() > 0, "failed gates missing");
  await page.screenshot({ path: path.join(outputDir, "desktop-1366x768-all-evaluated.png"), fullPage: true });
  await page.getByRole("button", { name: "Close inspector" }).click();
  check("all-stock API failures", auditFailures.length === 0, auditFailures.join(" | "));
  await page.goto(`${origin}/n50/strategy/rolling-monthly?view=absolute-first-session`, { waitUntil: "networkidle", timeout: 120_000 });
  check("legacy first-session redirect", new URL(page.url()).pathname.endsWith("/strategy/monthly") && new URL(page.url()).searchParams.get("entryMethod") === "FIRST_SESSION", page.url());
  await context.close();
} finally {
  await browser.close();
  await fs.writeFile(path.join(outputDir, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
}

console.log(JSON.stringify({ checks: results.length, passed: results.filter((row) => row.passed).length, outputDir }, null, 2));
