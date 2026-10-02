import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = (process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:19090/n50").replace(/\/$/, "");
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
const outputDir = path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR ?? "output/playwright/monthly-all-stock-ledger-20260824");
if (!password) throw new Error("PLAYWRIGHT_ADMIN_PASSWORD is required");

await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
const check = (name, passed, detail = "") => {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}: ${detail}`);
};

try {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const login = await context.request.post(`${baseUrl}/auth/session/dev-login`, {
    data: { identifier: "admin", password },
  });
  check("authenticated", login.ok(), `status=${login.status()}`);
  const page = await context.newPage();
  const consoleErrors = [];
  const telemetryErrors = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const source = message.location().url;
    const telemetry = /^https:\/\/(?:[^/]+\.)?(?:clarity\.ms|cloudflareinsights\.com|google-analytics\.com|googletagmanager\.com)\//i.test(source);
    if (telemetry) telemetryErrors.push({ source, error: message.text() });
    else consoleErrors.push(`${source}: ${message.text()}`);
  });

  await page.goto(`${baseUrl}/strategy/monthly`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.getByRole("heading", { name: "Monthly Strategy", exact: true }).waitFor();
  if (process.env.PLAYWRIGHT_PREVIEW_MONTHLY_INSPECTOR === "1") {
    await page.addStyleTag({ content: 'aside[aria-label$=" strategy evidence"] { top: var(--app-header-height, 56px); height: calc(100dvh - var(--app-header-height, 56px)); }' });
  }
  const absolute = await page.evaluate(async (url) => {
    const response = await fetch(url, { credentials: "include" });
    return { status: response.status, payload: await response.json() };
  }, `${baseUrl}/v1/rolling-monthly/absolute-months?year=2026&month=08`);
  check("absolute API", absolute.status === 200, `status=${absolute.status}`);
  check("absolute all-stock ledger", absolute.payload.evaluations?.length > 0,
    `evaluations=${absolute.payload.evaluations?.length}`);
  check("absolute rejected evidence", absolute.payload.evaluations.some((row) => row.selection_status === "REJECTED" && row.rejection_reasons?.length), "no rejected row with reasons");

  const summaryResponse = page.waitForResponse(response => response.url().includes("/v1/rolling-monthly/absolute-evaluations") && !/absolute-evaluations\//.test(response.url()));
  await page.getByLabel("Selection").selectOption("REJECTED");
  check("compact rejection ledger API", (await summaryResponse).status() === 200);
  await page.getByRole("combobox", { name: /^Entry method/ }).selectOption("MONTHLY_CLOSURE");
  await page.waitForFunction(() => {
    const select = Array.from(document.querySelectorAll("label")).find((label) => label.textContent?.includes("Failure reason"))?.querySelector("select");
    return Boolean(select && select.options.length > 1);
  }, undefined, { timeout: 120_000 });
  check("absolute reason filter", await page.getByLabel("Failure reason").locator("option").count() > 1, "reason options missing");
  await page.locator("tbody tr").first().waitFor();
  check("absolute rejected rows visible", await page.locator("tbody tr").count() > 0);
  const evidenceResponse = page.waitForResponse(response => /absolute-evaluations\/[a-f0-9-]+/.test(response.url()));
  await page.locator("tbody tr").first().click();
  check("full condition evidence loads on demand", (await evidenceResponse).status() === 200);
  await page.getByRole("heading", { name: "Why it was not selected" }).waitFor();
  await page.screenshot({ path: path.join(outputDir, "monthly-rejected-with-reasons.png"), fullPage: true });
  await page.getByRole("button", { name: "Close inspector", exact: true }).click();

  await page.goto(`${baseUrl}/strategy/rolling-monthly`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.getByRole("heading", { name: "Rolling Strategy", exact: true }).waitFor();
  const rolling = await page.evaluate(async (url) => {
    const response = await fetch(url, { credentials: "include" });
    return { status: response.status, payload: await response.json() };
  }, `${baseUrl}/v1/rolling-strategy/dashboard`);
  check("rolling API", rolling.status === 200, `status=${rolling.status}`);
  check("rolling all-stock ledger", rolling.payload.evaluations?.length > 0,
    `evaluations=${rolling.payload.evaluations?.length}`);
  check(
    "rolling population reconciles",
    rolling.payload.summary?.latestEvaluation?.total === rolling.payload.evaluations?.length,
    JSON.stringify(rolling.payload.summary?.latestEvaluation),
  );

  await page.getByLabel("Population").selectOption("REJECTED");
  await page.locator("tbody tr").first().waitFor();
  check("rolling rejected rows visible", await page.locator("tbody tr").count() > 0);
  await page.locator("tbody tr").first().click();
  await page.getByRole("heading", { name: "Why it was not selected" }).waitFor();
  check("no page overflow", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    `scrollWidth=${await page.evaluate(() => document.documentElement.scrollWidth)}`);
  await fs.writeFile(path.join(outputDir, "external-telemetry-errors.json"), JSON.stringify(telemetryErrors, null, 2));
  check("application console clean", consoleErrors.length === 0, consoleErrors.join(" | "));
  await page.screenshot({ path: path.join(outputDir, "rolling-rejected-with-reasons.png"), fullPage: true });
  await context.close();
} finally {
  await browser.close();
  await fs.writeFile(path.join(outputDir, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
}

console.log(JSON.stringify({ checks: results.length, passed: results.filter((row) => row.passed).length, outputDir }, null, 2));
