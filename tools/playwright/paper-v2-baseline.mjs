import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = (process.env.PLAYWRIGHT_BASE_URL ?? "https://n50.nifty50today.co.in/n50").replace(/\/$/, "");
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
if (!password) throw new Error("PLAYWRIGHT_ADMIN_PASSWORD is required");
const outputDir = path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR ?? "output/playwright/paper-v2-before");
await fs.mkdir(outputDir, { recursive: true });

const viewports = [
  { width: 1920, height: 1080 },
  { width: 1600, height: 900 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
];

const browser = await chromium.launch({ headless: true });
const results = [];
try {
  const context = await browser.newContext({ viewport: viewports[0] });
  const login = await context.request.post(`${baseUrl}/auth/session/dev-login`, {
    data: { identifier: "admin", password },
  });
  if (!login.ok()) throw new Error(`admin login failed: ${login.status()}`);

  const page = await context.newPage();
  const consoleErrors = [];
  const failedRequests = [];
  const ignoredExternal = /(?:static\.cloudflareinsights\.com|clarity\.ms|analytics\.google\.com|ERR_BLOCKED_BY_CLIENT|ERR_NETWORK_CHANGED)/;
  page.on("console", (message) => {
    if (message.type() === "error" && !ignoredExternal.test(message.text())) consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) => {
    const failure = `${request.method()} ${request.url()} ${request.failure()?.errorText ?? "failed"}`;
    if (!ignoredExternal.test(failure)) failedRequests.push(failure);
  });

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    const route = await page.goto(`${baseUrl}/paper-trading`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    if (!route?.ok()) throw new Error(`paper route failed at ${viewport.width}x${viewport.height}: ${route?.status()}`);
    await page.getByRole("heading", { name: "Complete trade evidence" }).waitFor({ timeout: 120_000 });
    await page.waitForTimeout(750);
    const dimensions = await page.evaluate(() => ({
      viewportWidth: document.documentElement.clientWidth,
      bodyScrollWidth: document.documentElement.scrollWidth,
      bodyOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      pageHeight: document.documentElement.scrollHeight,
      headings: [...document.querySelectorAll("h1,h2")].map((node) => node.textContent?.trim()).filter(Boolean),
    }));
    const name = `paper-trading-before-${viewport.width}x${viewport.height}.png`;
    await page.screenshot({ path: path.join(outputDir, name), fullPage: true });
    results.push({ viewport, screenshot: name, ...dimensions });
  }

  await fs.writeFile(path.join(outputDir, "baseline-results.json"), JSON.stringify({
    capturedAt: new Date().toISOString(),
    baseUrl,
    results,
    consoleErrors,
    failedRequests,
  }, null, 2));
  if (consoleErrors.length) throw new Error(`browser console errors: ${consoleErrors.join(" | ")}`);
  if (failedRequests.length) throw new Error(`failed requests: ${failedRequests.join(" | ")}`);
  console.log(JSON.stringify({ status: "PASS", outputDir, results }, null, 2));
} finally {
  await browser.close();
}
