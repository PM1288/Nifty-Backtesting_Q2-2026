import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const base = (process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:19090/n50").replace(/\/$/, "");
const output = process.env.PLAYWRIGHT_OUTPUT_DIR ?? "/tmp/stock-360-chart-first";
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
if (!password) throw new Error("PLAYWRIGHT_ADMIN_PASSWORD is required");
await fs.mkdir(output, { recursive: true });

const results = [];
function check(name, pass, detail) {
  results.push({ name, status: pass ? "PASS" : "FAIL", detail });
  if (!pass) throw new Error(`${name}: ${detail}`);
}

async function authenticatedContext(browser, viewport) {
  const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
  const login = await context.request.post(`${base}/auth/session/dev-login`, {
    headers: { Origin: new URL(base).origin },
    data: { identifier: "admin", password },
  });
  check(`${viewport.width}px authenticated`, login.ok(), `HTTP ${login.status()}`);
  return context;
}

const browser = await chromium.launch({ headless: true });
try {
  const desktop = await authenticatedContext(browser, { width: 1440, height: 1000 });
  const page = await desktop.newPage();
  const started = new Map();
  const requests = [];
  const errors = [];
  page.on("request", (request) => started.set(request, performance.now()));
  page.on("response", (response) => {
    const start = started.get(response.request());
    if (start != null && response.url().includes("/n50/")) requests.push({ url: response.url(), status: response.status(), durationMs: Math.round(performance.now() - start) });
  });
  page.on("pageerror", (error) => errors.push(String(error)));
  const navigationStart = performance.now();
  await page.goto(`${base}/analytics/stock/PNB`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  const workstation = page.getByTestId("stock-360");
  await workstation.waitFor({ state: "visible", timeout: 30_000 });
  const intraday = page.getByTestId("stock-360-intraday-chart");
  await intraday.waitFor({ state: "visible", timeout: 30_000 });
  const chartFirstMs = Math.round(performance.now() - navigationStart);
  check("Chart-first workstation rendered", await intraday.locator("canvas").count() >= 1, `chartFirstMs=${chartFirstMs}`);
  check("Two primary charts render", await page.locator('canvas[data-zr-dom-id], [data-testid="stock-360"] canvas').count() >= 2, `canvases=${await page.locator('[data-testid="stock-360"] canvas').count()}`);
  const labels = await intraday.locator('button[role="listitem"] span').allTextContents();
  check("Compact reference labels", ["15m", "1H", "Day", "Week", "Month", "3M", "Year", "PDC"].every((label) => labels.includes(label)), labels.join(" | "));
  check("Only PDC retains close terminology", !(await intraday.locator('button[role="listitem"]').allTextContents()).some((label) => /open/i.test(label)), labels.join(" | "));
  check("Daily volume, traded value and delivery are visible", await page.getByText("Daily price, volume, traded value and delivery", { exact: true }).count() === 1 && await page.getByText("Delivery", { exact: true }).count() >= 1, "daily chart and KPI present");
  const signalRow = page.getByTestId("stock-360-signal-row");
  check("Stock signals are one compact row", await signalRow.count() === 1 && await signalRow.locator(":scope > div").count() === 7, `cells=${await signalRow.locator(":scope > div").count()}`);
  check("No eager 1M history request", !requests.some((row) => row.url.includes("range=1M")), requests.map((row) => row.url).join("\n"));
  check("No browser exceptions", errors.length === 0, errors.join(" | "));
  check("Desktop has no page overflow", await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), String(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)));
  await page.screenshot({ path: path.join(output, "desktop-stock-360-pnb.png"), fullPage: true });
  await page.getByRole("button", { name: "Load full OIIS, F&O and strategy evidence" }).click();
  await page.getByText(/OIIS snapshot|No current OIIS evidence/).first().waitFor({ state: "visible", timeout: 90_000 });
  check("Deferred evidence remains accessible", true, "expanded after primary charts");
  await desktop.close();

  const mobile = await authenticatedContext(browser, { width: 390, height: 844 });
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(`${base}/analytics/stock/PNB`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await mobilePage.getByTestId("stock-360-intraday-chart").waitFor({ state: "visible", timeout: 30_000 });
  check("Mobile has no page overflow", await mobilePage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), String(await mobilePage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)));
  await mobilePage.screenshot({ path: path.join(output, "mobile-stock-360-pnb.png"), fullPage: true });
  await mobile.close();

  await fs.writeFile(path.join(output, "requests.json"), JSON.stringify({ chartFirstMs, requests }, null, 2));
} finally {
  await browser.close();
  await fs.writeFile(path.join(output, "results.json"), JSON.stringify(results, null, 2));
}

console.log(JSON.stringify({ passed: results.filter((row) => row.status === "PASS").length, total: results.length, output }));
