import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = (process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:19090/n50").replace(/\/$/, "");
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
const outputDir = path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR ?? "output/playwright/rolling-monthly-absolute-20260815");
if (!password) throw new Error("PLAYWRIGHT_ADMIN_PASSWORD is required");

await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
const check = (name, passed, detail = "") => {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}: ${detail}`);
};

try {
  for (const viewport of [
    { name: "desktop-1366x768", width: 1366, height: 768 },
    { name: "mobile-390x844", width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({ viewport });
    const login = await context.request.post(`${baseUrl}/auth/session/dev-login`, {
      data: { identifier: "admin", password },
    });
    check(`${viewport.name} login`, login.ok(), `status=${login.status()}`);
    const page = await context.newPage();
    const errors = [];
    page.on("console", (message) => {
      if (message.type() === "error" && !/cloudflareinsights|clarity\.ms/i.test(message.text())) errors.push(message.text());
    });
    await page.goto(`${baseUrl}/strategy/rolling-monthly?view=absolute`, { waitUntil: "networkidle", timeout: 60_000 });
    await page.getByText("Absolute calendar-month variant", { exact: true }).waitFor();
    check(`${viewport.name} report filters`, await page.getByLabel("Absolute Monthly report filters").count() === 1);
    check(`${viewport.name} CSV`, await page.getByRole("link", { name: "CSV" }).count() === 1);
    check(`${viewport.name} Excel`, await page.getByRole("link", { name: "Excel" }).count() === 1);
    check(`${viewport.name} monthly chart`, await page.getByRole("img", { name: /average end return, maximum profit and maximum drawdown by month/ }).count() === 1);
    check(`${viewport.name} yearly summary`, await page.getByRole("heading", { name: "Opportunities and gross result" }).count() === 1);
    check(`${viewport.name} opportunity rows`, await page.locator("table tbody tr").count() > 0);
    const api = await page.evaluate(async (url) => {
      const response = await fetch(url, { credentials: "include" });
      return { status: response.status, payload: await response.json() };
    }, `${baseUrl}/v1/rolling-monthly/absolute-months?year=2026&month=08`);
    check(`${viewport.name} API`, api.status === 200, `status=${api.status}`);
    check(`${viewport.name} isolated strategy`, api.payload.variant === "ABSOLUTE_MONTHLY_CLOSURE" && api.payload.independentFromOiis === true && api.payload.paperTradingConnected === false, JSON.stringify(api.payload));
    check(`${viewport.name} seven checks`, api.payload.candidates.every((row) => Array.isArray(row.conditions) && row.conditions.length === 7 && row.conditions.every((item) => item.pass === true)));
    await page.locator("button[class*='stockChartLink']").first().click();
    await page.getByRole("dialog", { name: /candlestick chart/ }).waitFor();
    check(`${viewport.name} entry annotation`, await page.getByText("Selected absolute-month entry", { exact: true }).count() === 1);
    check(`${viewport.name} chart rendered`, await page.getByRole("img", { name: /daily candlestick chart with calendar-month dividers and blue Absolute Monthly entry marker/ }).count() === 1);
    await page.screenshot({ path: path.join(outputDir, `${viewport.name}-chart.png`), fullPage: true });
    await page.getByRole("button", { name: "Close candlestick chart" }).click();
    check(`${viewport.name} no body overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    check(`${viewport.name} console clean`, errors.length === 0, errors.join(" | "));
    await page.screenshot({ path: path.join(outputDir, `${viewport.name}.png`), fullPage: true });
    await context.close();
  }
} finally {
  await browser.close();
  await fs.writeFile(path.join(outputDir, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
}

console.log(JSON.stringify({ checks: results.length, passed: results.filter((row) => row.passed).length, outputDir }, null, 2));
