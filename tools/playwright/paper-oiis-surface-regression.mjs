import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = (process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:19090/n50").replace(/\/$/, "");
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
if (!password) throw new Error("PLAYWRIGHT_ADMIN_PASSWORD is required");
const outputDir = path.resolve("output/playwright/paper-oiis-surface");
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const login = await context.request.post(`${baseUrl}/auth/session/dev-login`, { data: { identifier: "admin", password } });
  if (!login.ok()) throw new Error(`admin login failed: ${login.status()}`);
  const api = await context.request.get(`${baseUrl}/v1/workspace/paper-trading`, { timeout: 120_000 });
  if (!api.ok()) throw new Error(`paper API failed: ${api.status()}`);
  const payload = await api.json();
  const trades = payload.stockTrades ?? [];
  const factorTrades = trades.filter((trade) => Number.isFinite(Number(trade.evidence_ofactor)) && Number.isFinite(Number(trade.evidence_xfactor)) && trade.evidence_ofactor != null && trade.evidence_xfactor != null);
  if (factorTrades.length < 2) throw new Error(`expected at least two OIIS factor observations, found ${factorTrades.length}`);

  const page = await context.newPage();
  const consoleErrors = [];
  const ignoredExternalCsp = /(?:static\.cloudflareinsights\.com|https:\/\/[^/]+\.clarity\.ms\/collect)/;
  page.on("console", (message) => { if (message.type() === "error" && !ignoredExternalCsp.test(message.text()) && !message.text().includes("net::ERR_NETWORK_CHANGED")) consoleErrors.push(message.text()); });
  const route = await page.goto(`${baseUrl}/paper-trading`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  if (!route?.ok()) throw new Error(`paper route failed: ${route?.status()}`);
  await page.getByRole("heading", { name: "Which entry conditions produced reward or pain" }).waitFor({ timeout: 120_000 });
  const chart = page.getByRole("group", { name: /Intraday max profit by OFactor/ });
  await chart.waitFor();
  const pointCount = await chart.getByRole("button").count();
  if (pointCount !== factorTrades.length) throw new Error(`surface point mismatch: UI ${pointCount}, API ${factorTrades.length}`);
  await page.getByRole("button", { name: /Swing drawdown/ }).click();
  await page.getByRole("group", { name: /Swing drawdown by OFactor/ }).waitFor();
  await page.getByText("−₹2,000 neon red", { exact: true }).waitFor();
  await page.getByText("−₹100 to +₹100 neon yellow", { exact: true }).waitFor();
  await page.getByText("+₹2,000 neon dark green", { exact: true }).waitFor();
  const axisChecks = [
    ["RSI × ATR", /Swing drawdown by Entry-time RSI14 and Entry-time ATR14/],
    ["RSI × Williams", /Swing drawdown by Entry-time RSI14 and Entry-time Williams %R/],
    ["ATR × relative volume", /Swing drawdown by Entry-time ATR14 and Volume ÷ SMA20/],
    ["Opportunity × RSI", /Swing drawdown by OFactor · opportunity quality and Entry-time RSI14/],
    ["Opportunity × execution", /Swing drawdown by OFactor · opportunity quality and XFactor · execution quality/],
  ];
  for (const [tabName, chartName] of axisChecks) {
    await page.getByRole("tab", { name: new RegExp(String(tabName)) }).click();
    const activeChart = page.getByRole("group", { name: chartName });
    await activeChart.waitFor();
    if (await activeChart.getByRole("button").count() < 2) throw new Error(`${tabName} has insufficient plotted evidence`);
  }
  const firstPoint = page.getByRole("group", { name: /Swing drawdown by OFactor/ }).getByRole("button").first();
  await firstPoint.locator("circle").hover({ force: true });
  await page.getByText("Intraday analytical levels", { exact: true }).waitFor();
  const hoverText = await page.locator('aside[class*="oiisSurfaceHoverCard"]').innerText();
  if (!/Quantity/i.test(hoverText) || !/Entry price/i.test(hoverText) || !/\+0\.3%/.test(hoverText) || !/\+1%/.test(hoverText)) throw new Error(`hover evidence incomplete: ${hoverText}`);
  await page.screenshot({ path: path.join(outputDir, "desktop-swing-drawdown.png"), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.getByRole("heading", { name: "Which entry conditions produced reward or pain" }).waitFor({ timeout: 120_000 });
  await page.getByRole("tab", { name: /RSI × ATR/ }).click();
  await page.getByRole("button", { name: /30D max profit/ }).click();
  await page.getByRole("group", { name: /30D max profit by Entry-time RSI14 and Entry-time ATR14/ }).waitFor();
  await page.screenshot({ path: path.join(outputDir, "mobile-30d-profit.png"), fullPage: true });
  if (consoleErrors.length) throw new Error(`application console errors: ${consoleErrors.join(" | ")}`);
  console.log(JSON.stringify({ status: "PASS", trades: trades.length, factorTrades: factorTrades.length, surfacePoints: pointCount, axisViews: 5, outcomeLenses: 5, hoverEvidence: true, desktop: true, mobile: true }, null, 2));
} finally {
  await browser.close();
}
