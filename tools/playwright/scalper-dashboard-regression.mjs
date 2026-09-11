import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const base = (process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:15187").replace(/\/$/, "");
const authOrigin = process.env.PLAYWRIGHT_AUTH_ORIGIN ?? new URL(base).origin;
const output = process.env.PLAYWRIGHT_OUTPUT_DIR ?? "/tmp/scalper-dashboard-regression";
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
if (!password) throw new Error("PLAYWRIGHT_ADMIN_PASSWORD is required");
await fs.mkdir(output, { recursive: true });

const results = [];
function check(name, pass, detail) {
  results.push({ name, status: pass ? "PASS" : "FAIL", detail });
  if (!pass) throw new Error(`${name}: ${detail}`);
}

async function authenticate(context) {
  const response = await context.request.post(`${base}/auth/session/dev-login`, {
    data: { identifier: "admin", password }, headers: { Origin: authOrigin },
  });
  check("Authenticated isolated candidate", response.ok(), `HTTP ${response.status()}`);
  const pair = (response.headers()["set-cookie"] ?? "").split(";", 1)[0];
  const separator = pair.indexOf("=");
  if (separator > 0) await context.addCookies([{
    name: pair.slice(0, separator), value: pair.slice(separator + 1),
    domain: new URL(base).hostname, path: "/", httpOnly: true, secure: false, sameSite: "Lax",
  }]);
}

const browser = await chromium.launch({ headless: true });
try {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, reducedMotion: "reduce" });
  await authenticate(desktop);
  const api = await desktop.request.get(`${base}/v1/overview/scalper-progression`);
  check("Real screener API", api.ok(), `HTTP ${api.status()} ${(await api.text()).slice(0, 300)}`);
  const payload = await api.json();
  check("Current F&O stock universe populated", payload.scope === "CURRENT_NSE_STOCK_FNO_UNIVERSE" && payload.rows.length > 0, `rows=${payload.rows.length}`);
  check("Every row exposes complete anchor contract", payload.rows.every((row) => ["todayOpen", "todayClose", "previousDayOpen", "previousDayClose", "currentWeekOpen", "currentWeekClose", "previousWeekOpen", "previousWeekClose", "twoWeeksAgoOpen", "twoWeeksAgoClose", "currentMonthOpen", "currentMonthClose", "previousMonthOpen", "previousMonthClose", "twoMonthsAgoOpen", "twoMonthsAgoClose"].every((key) => Object.hasOwn(row, key))), "one or more keys absent");
  check("Five condition states per stock", payload.rows.every((row) => row.conditions?.length === 5), "condition contract incomplete");

  const page = await desktop.newPage();
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(String(error)));
  await page.goto(`${base}/strategy/scalper-dashboard`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.getByTestId("scalper-dashboard").waitFor({ state: "visible", timeout: 30_000 });
  await page.getByTestId("scalper-table").waitFor({ state: "visible", timeout: 30_000 });
  check("All API rows render before filtering", Number(await page.getByTestId("scalper-visible-count").innerText()) === payload.rows.length, `visible=${await page.getByTestId("scalper-visible-count").innerText()} api=${payload.rows.length}`);
  const headings = await page.getByTestId("scalper-table").locator("thead").innerText();
  check("All requested periods are visible", ["Today", "Previous day", "Current week", "Last week", "Two weeks ago", "This month", "Previous month", "Two months ago"].every((label) => headings.includes(label)), headings);
  const tableGeometry = await page.getByTestId("scalper-table-scroll").evaluate((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
  check("Wide ledger uses contained horizontal scrolling", tableGeometry.scrollWidth > tableGeometry.clientWidth, JSON.stringify(tableGeometry));
  const firstSymbol = payload.rows[0].symbol;
  await page.getByTestId("scalper-search").fill(firstSymbol);
  check("Stock search filters deterministically", Number(await page.getByTestId("scalper-visible-count").innerText()) >= 1, firstSymbol);
  await page.getByRole("button", { name: "Clear filters" }).click();
  await page.getByTestId("scalper-score-filter").selectOption("ALL_PASS");
  const expectedAllPass = payload.rows.filter((row) => row.passedConditionCount === 5 && row.availableConditionCount === 5).length;
  check("Condition score filter reconciles to API", Number(await page.getByTestId("scalper-visible-count").innerText()) === expectedAllPass, `ui=${await page.getByTestId("scalper-visible-count").innerText()} api=${expectedAllPass}`);
  await page.getByRole("button", { name: "Clear filters" }).click();

  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("scalper-dashboard-excel").click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  const workbook = downloadPath ? await fs.readFile(downloadPath, "utf8") : "";
  check("Excel export has truthful scope and all anchors", download.suggestedFilename().endsWith(".xls") && workbook.includes("Current month") && workbook.includes("Two months ago close") && workbook.includes("CURRENT_NSE_STOCK_FNO_UNIVERSE"), download.suggestedFilename());
  check("No browser exceptions", browserErrors.length === 0, browserErrors.join(" | "));
  check("Desktop page has no accidental horizontal overflow", await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), String(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)));
  await page.screenshot({ path: path.join(output, "scalper-dashboard-desktop.png"), fullPage: true });
  await desktop.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  await authenticate(mobile);
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(`${base}/strategy/scalper-dashboard`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await mobilePage.getByTestId("scalper-table").waitFor({ state: "visible", timeout: 30_000 });
  check("Mobile table remains internally scrollable", await mobilePage.getByTestId("scalper-table-scroll").evaluate((element) => element.scrollWidth > element.clientWidth), "table did not overflow its own viewport");
  check("Mobile page has no accidental horizontal overflow", await mobilePage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), String(await mobilePage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)));
  await mobilePage.screenshot({ path: path.join(output, "scalper-dashboard-mobile.png"), fullPage: true });
  await mobile.close();
} finally {
  await browser.close();
  await fs.writeFile(path.join(output, "results.json"), JSON.stringify(results, null, 2));
}

console.log(JSON.stringify({ passed: results.length, output }));
