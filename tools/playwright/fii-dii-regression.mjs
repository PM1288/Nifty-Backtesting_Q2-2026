import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = (process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:19090/n50").replace(/\/$/, "");
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
const outputDir = path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR ?? "output/playwright/fii-dii-flow");
if (!password) throw new Error("PLAYWRIGHT_ADMIN_PASSWORD is required");

await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const bootstrap = await browser.newContext();
const login = await bootstrap.request.post(`${baseUrl}/auth/session/dev-login`, {
  data: { identifier: "admin", password }
});
if (!login.ok()) throw new Error(`Admin login failed: ${login.status()}`);
const storageState = await bootstrap.storageState();
await bootstrap.close();

const results = [];
try {
  for (const viewport of [
    { name: "desktop-1920x1080", width: 1920, height: 1080 },
    { name: "mobile-390x844", width: 390, height: 844 }
  ]) {
    const context = await browser.newContext({ viewport, storageState });
    const page = await context.newPage();
    const responseErrors = [];
    const consoleErrors = [];
    page.on("response", (response) => {
      if (response.status() >= 400 && response.url().startsWith(baseUrl)) {
        responseErrors.push(`${response.status()} ${response.url()}`);
      }
    });
    page.on("console", (message) => {
      if (message.type() === "error" && !/clarity|cloudflareinsights/i.test(message.text())) consoleErrors.push(message.text());
    });

    const response = await page.goto(`${baseUrl}/institutional/flow`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.getByRole("heading", { name: "FII / DII & Participant Flow" }).waitFor({ timeout: 30_000 });
    await page.getByText("FII/FPI and DII cash-flow trend", { exact: true }).waitFor();
    await page.getByText("Institutional source coverage", { exact: true }).waitFor();
    await page.getByText("NSE cash FII/DII", { exact: true }).waitFor();
    await page.getByText("Detailed participant report used below", { exact: true }).waitFor();
    const primaryChart = page.getByText("FII/FPI and DII cash-flow trend", { exact: true }).locator("xpath=ancestor::article");
    const primaryCanvas = primaryChart.locator("canvas").first();
    await primaryCanvas.waitFor();
    const canvasBox = await primaryCanvas.boundingBox();
    const currentCount = await page.getByText("CURRENT", { exact: true }).count();
    const staleCount = await page.getByText("STALE", { exact: true }).count();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    const screenshot = path.join(outputDir, `fii-dii-${viewport.name}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    results.push({
      viewport: viewport.name,
      status: response?.status() ?? null,
      currentCount,
      staleCount,
      primaryChartHeight: canvasBox?.height ?? 0,
      overflow,
      responseErrors,
      consoleErrors,
      screenshot
    });
    await context.close();
  }
} finally {
  await browser.close();
}

await fs.writeFile(path.join(outputDir, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
const failures = results.filter((row) => row.status !== 200 || row.currentCount < 1 || row.staleCount < 1 || row.primaryChartHeight < 250 || row.overflow || row.responseErrors.length || row.consoleErrors.length);
console.log(JSON.stringify({ checks: results.length, passed: results.length - failures.length, failed: failures.length, outputDir }, null, 2));
if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exitCode = 1;
}
