import fs from "node:fs";
import { chromium } from "playwright";

const baseUrl = process.env.N50_BASE_URL || "http://127.0.0.1:19090/n50";
const password = process.env.DEV_LOCAL_AUTH_PASSWORD;
if (!password) throw new Error("DEV_LOCAL_AUTH_PASSWORD is required");

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const login = await context.request.post(`${baseUrl}/auth/session/dev-login`, {
    headers: { Origin: new URL(baseUrl).origin },
    data: { identifier: "admin", password },
  });
  if (!login.ok()) throw new Error(`login HTTP ${login.status()}`);

  const page = await context.newPage();
  const dataResponse = page.waitForResponse((response) => response.url().includes("/v1/futures-volatility/screener?") && response.ok());
  const response = await page.goto(`${baseUrl}/futures/volatility`, { waitUntil: "domcontentloaded" });
  if (!response?.ok()) throw new Error(`page HTTP ${response?.status()}`);
  const api = await (await dataResponse).json();
  await page.getByRole("heading", { name: "Futures Volatility Screener" }).waitFor();

  await page.locator('button[aria-controls="strategy-global-menu"]').click();
  const menuLink = page.getByRole("menuitem", { name: /Futures Volatility/ });
  await menuLink.waitFor();
  const menuHref = await menuLink.getAttribute("href");
  if (menuHref !== "/n50/futures/volatility") throw new Error(`incorrect menu href: ${menuHref}`);

  const body = await page.locator("body").innerText();
  if (!body.includes("Report values are available.")) throw new Error("pending outcome explanation missing");
  const tableRows = await page.locator("tbody tr").count();
  if (tableRows < 9) throw new Error(`expected report values, found only ${tableRows} rows`);
  const screenshot = "/tmp/futures-volatility-live-menu.png";
  await page.screenshot({ path: screenshot, fullPage: true });

  const first = api?.rows?.[0] ?? {};
  console.log(JSON.stringify({
    status: "PASS",
    pageStatus: response.status(),
    menuHref,
    tableRows,
    reportDate: first.reportDate ?? null,
    analysisSession: first.analysisSession ?? null,
    readiness: api?.readiness?.state ?? api?.readiness ?? null,
    sourceRows: api?.counts?.sourceRows ?? null,
    displayed: api?.counts?.displayed ?? api?.rows?.length ?? null,
    priceCovered: api?.counts?.priceCovered ?? null,
    firstSymbol: first.symbol ?? null,
    firstPreviousVol: first.previousFuturesDailyVol ?? null,
    firstCurrentVol: first.currentFuturesDailyVol ?? null,
    firstDeltaBp: first.deltaBasisPoints ?? null,
    firstOutcomeState: first.outcomeState ?? null,
    screenshot,
  }, null, 2));
  await context.close();
} finally {
  await browser.close();
}
