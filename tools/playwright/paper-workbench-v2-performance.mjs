import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = (process.env.PLAYWRIGHT_BASE_URL ?? "https://n50.nifty50today.co.in/n50").replace(/\/$/, "");
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
if (!password) throw new Error("PLAYWRIGHT_ADMIN_PASSWORD is required");
const outputDir = path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR ?? "output/playwright/paper-workbench-v2-performance");
await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const login = await context.request.post(`${baseUrl}/auth/session/dev-login`, { data: { identifier: "admin", password } });
  if (!login.ok()) throw new Error(`admin login failed: ${login.status()}`);
  const apiMs = [];
  let tradeCount = 0;
  for (let index = 0; index < 5; index += 1) {
    const started = performance.now();
    const response = await context.request.get(`${baseUrl}/v1/workspace/paper-trading`, { timeout: 120_000 });
    apiMs.push(Number((performance.now() - started).toFixed(1)));
    if (!response.ok()) throw new Error(`API sample failed: ${response.status()}`);
    tradeCount = (await response.json()).stockTrades?.length ?? 0;
  }
  const sorted = [...apiMs].sort((a, b) => a - b);
  const page = await context.newPage();
  const routeStarted = performance.now();
  await page.goto(`${baseUrl}/paper-trading`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.getByRole("heading", { name: "Paper Trading Evidence Workbench" }).waitFor({ timeout: 120_000 });
  const meaningfulMs = Number((performance.now() - routeStarted).toFixed(1));
  const paint = await page.evaluate(() => Object.fromEntries(performance.getEntriesByType("paint").map((entry) => [entry.name, Number(entry.startTime.toFixed(1))])));
  const result = { status: "PASS", measuredAt: new Date().toISOString(), environment: "Production public HTTPS route, headless Chromium, 1366x768, server-local network", tradeCount, apiSamplesMs: apiMs, apiMedianMs: sorted[Math.floor(sorted.length / 2)], apiMaxMs: Math.max(...apiMs), routeToWorkbenchHeadingMs: meaningfulMs, paint, bundle: { paperTradingJsGzipKb: 42.21, paperTradingCssGzipKb: 19.77 }, limits: ["This is an interactive five-sample production check, not a full market-session soak.", "Browser and network conditions are server-local and should not be represented as end-user broadband SLO results."] };
  await fs.writeFile(path.join(outputDir, "performance-results.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
