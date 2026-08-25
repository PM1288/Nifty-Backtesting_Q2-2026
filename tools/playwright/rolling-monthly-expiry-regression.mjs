import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = (process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:19090/n50").replace(/\/$/, "");
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
const outputDir = path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR ?? "output/playwright/rolling-monthly-expiry");
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
    { name: "desktop-1920x1080", width: 1920, height: 1080 },
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
    await page.goto(`${baseUrl}/strategy/rolling-monthly?view=expiry`, {
      waitUntil: "networkidle",
      timeout: 60_000,
    });
    await page.getByRole("heading", { name: "Qualification and next-expiry outcome" }).waitFor();
    for (const month of ["July 2026", "June 2026", "May 2026"]) {
      check(`${viewport.name} ${month} tab`, await page.getByRole("button", { name: new RegExp(month) }).count() === 1);
    }
    check(`${viewport.name} average return`, await page.getByText("Average expiry P/L", { exact: true }).count() === 1);
    check(`${viewport.name} max excursions`, await page.getByText("Average max profit / drawdown", { exact: true }).count() === 1);
    await page.getByRole("button", { name: /June 2026/ }).click();
    await page.getByText("June 2026 cohort", { exact: true }).waitFor();
    check(`${viewport.name} June URL`, page.url().includes("cohort=2026-06-01"), page.url());
    check(`${viewport.name} mature June rows`, await page.getByText("Matured", { exact: true }).count() >= 1);
    await page.getByRole("button", { name: /May 2026/ }).click();
    await page.getByText("May 2026 cohort", { exact: true }).waitFor();
    check(`${viewport.name} cohort URL`, page.url().includes("cohort=2026-05-01"), page.url());
    check(`${viewport.name} mature May rows`, await page.getByText("Matured", { exact: true }).count() >= 1);
    await page.locator("button[class*='stockChartLink']").first().click();
    await page.getByRole("dialog", { name: /weekly candlestick chart/ }).waitFor();
    check(`${viewport.name} weekly chart opens`, await page.getByText(/Weekly OHLC candles · purple vertical lines mark each calendar month/).count() === 1);
    await page.getByRole("img", { name: /weekly candlestick and volume chart with monthly separators/ }).waitFor();
    check(`${viewport.name} weekly chart rendered`, await page.getByRole("img", { name: /weekly candlestick and volume chart with monthly separators/ }).count() === 1);
    await page.screenshot({ path: path.join(outputDir, `${viewport.name}-weekly-chart.png`), fullPage: true });
    await page.getByRole("button", { name: "Close weekly chart" }).click();
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
