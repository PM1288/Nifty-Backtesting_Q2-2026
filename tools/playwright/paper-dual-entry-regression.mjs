import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const origin = (process.env.PLAYWRIGHT_ORIGIN ?? "http://127.0.0.1:19090").replace(/\/$/, "");
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
const outputDir = path.resolve(
  process.env.PLAYWRIGHT_OUTPUT_DIR ?? "output/playwright/paper-dual-entry",
);
if (!password) throw new Error("PLAYWRIGHT_ADMIN_PASSWORD is required");

await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });

try {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const login = await context.request.post(`${origin}/auth/session/dev-login`, {
    data: { identifier: "admin", password },
  });
  if (!login.ok()) throw new Error(`admin login failed: ${login.status()}`);

  const page = await context.newPage();
  const pageErrors = [];
  const failedResponses = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  page.on("response", (response) => {
    if (response.status() >= 400 && /\/n50\/(v1|auth)\//.test(response.url())) {
      failedResponses.push(`${response.status()} ${response.url()}`);
    }
  });

  const response = await page.goto(`${origin}/n50/paper-trading?prefetch=off`, {
    waitUntil: "networkidle",
    timeout: 60_000,
  });
  if (!response?.ok()) throw new Error(`paper route failed: ${response?.status()}`);
  await page.getByRole("heading", { name: "Paper Trading", exact: true }).waitFor();

  const header = await page.locator("#trades thead").innerText();
  if (!header.includes("ENTRY STRATEGY")) throw new Error("entry strategy column is missing");

  const filter = page.getByLabel("Filter by entry strategy");
  const options = await filter.locator("option").evaluateAll((nodes) =>
    nodes.map((node) => ({ value: node.value, text: node.textContent?.trim() })),
  );
  for (const expected of ["RSI_WILLR", "PRICE_MOMENTUM_1D_1H_15M", "QUALITY_SUM_THRESHOLD"]) {
    if (!options.some((option) => option.value === expected)) {
      throw new Error(`missing entry strategy filter: ${expected}`);
    }
  }

  const api = await page.evaluate(async () => {
    const result = await fetch("/n50/v1/workspace/paper-trading", { credentials: "include" });
    return { status: result.status, body: await result.json() };
  });
  if (api.status !== 200) throw new Error(`paper workspace API failed: ${api.status}`);
  if (!api.body.stockTrades?.length) throw new Error("paper workspace returned no trades");
  if (api.body.stockTrades.some((trade) => typeof trade.entry_strategy !== "string")) {
    throw new Error("one or more trades lacks entry_strategy");
  }
  const history = await page.evaluate(async () => {
    const result = await fetch("/n50/v1/oiis-live/run-history?limit=24", { credentials: "include" });
    return { status: result.status, body: await result.json() };
  });
  if (history.status !== 200) throw new Error(`OIIS run history API failed: ${history.status}`);
  for (const run of history.body.runs ?? []) {
    const keys = (run.changes ?? []).map((change) => `${change.run_id}:${change.symbol}`);
    if (new Set(keys).size !== keys.length) {
      throw new Error(`OIIS run history duplicated a stock after method aggregation: ${run.run_id}`);
    }
  }

  await filter.selectOption("QUALITY_SUM_THRESHOLD");
  if ((await page.locator("#trades tbody tr").count()) < 1) {
    throw new Error("legacy quality-at-run filter returned no rows");
  }
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2)) {
    throw new Error("desktop document has horizontal overflow");
  }
  await page.screenshot({ path: path.join(outputDir, "paper-entry-strategy-1366x768.png") });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Paper Trading", exact: true }).waitFor();
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2)) {
    throw new Error("mobile document has horizontal overflow");
  }
  await page.screenshot({
    path: path.join(outputDir, "paper-entry-strategy-390x844.png"),
    fullPage: true,
  });

  if (pageErrors.length) throw new Error(`page errors: ${pageErrors.join(" | ")}`);
  if (failedResponses.length) throw new Error(`failed app responses: ${failedResponses.join(" | ")}`);
  await fs.writeFile(
    path.join(outputDir, "results.json"),
    JSON.stringify(
      {
        passed: true,
        options,
        tradeCount: api.body.stockTrades.length,
        oiisRunCount: history.body.runs?.length ?? 0,
      },
      null,
      2,
    ),
  );
  console.log(`PASS paper dual entry UI/API (${api.body.stockTrades.length} trades)`);
} finally {
  await browser.close();
}
