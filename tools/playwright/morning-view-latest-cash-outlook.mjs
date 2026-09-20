#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const requireFromTools = createRequire(path.join(repoRoot, "tools/playwright/package.json"));
const { chromium } = requireFromTools("playwright");
const baseUrl = (process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:19090/n50").replace(/\/$/, "");
const outputDir = path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR ?? "output/playwright/morning-view-latest-cash-outlook");
let password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
if (!password && process.env.PLAYWRIGHT_ADMIN_PASSWORD_FILE) {
  const env = await fs.readFile(process.env.PLAYWRIGHT_ADMIN_PASSWORD_FILE, "utf8");
  const line = env.split(/\r?\n/).find((entry) => entry.startsWith("DEV_LOCAL_AUTH_PASSWORD="));
  password = line?.slice(line.indexOf("=") + 1).trim().replace(/^(["'])(.*)\1$/, "$2");
}
if (!password) throw new Error("Supply PLAYWRIGHT_ADMIN_PASSWORD or PLAYWRIGHT_ADMIN_PASSWORD_FILE");

await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const bootstrap = await browser.newContext();
const login = await bootstrap.request.post(`${baseUrl}/auth/session/dev-login`, {
  headers: { Origin: new URL(baseUrl).origin },
  data: { identifier: "admin", password },
});
assert.equal(login.ok(), true, `login HTTP ${login.status()}`);
const storageState = await bootstrap.storageState();
await bootstrap.close();
const target = new URL(baseUrl);
storageState.cookies = storageState.cookies.map((cookie) => ({
  ...cookie,
  domain: target.hostname,
  path: "/",
  secure: target.protocol === "https:",
  sameSite: "Lax",
}));
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  reducedMotion: "reduce",
  storageState,
});

const api = await context.request.get(`${baseUrl}/v1/trading-analytics/morning-summary`);
assert.equal(api.ok(), true, `morning summary HTTP ${api.status()}`);
const summary = await api.json();
assert.equal(summary.cashReportDate, "2026-09-17");
assert.equal(summary.derivativesReportDate, "2026-09-18");
assert.equal(summary.equity, "Sell");
assert.equal(summary.futures, "Buy");
assert.equal(summary.options, "Buy");
assert.equal(summary.matrix, "Sideways (Bullish)");

const page = await context.newPage();
await page.goto(`${baseUrl}/strategy/trading-analytics?view=morning`, { waitUntil: "domcontentloaded", timeout: 90_000 });
const outlook = page.getByTestId("header-today-outlook");
await outlook.waitFor({ state: "visible", timeout: 90_000 });
await page.getByText("Cash 2026-09-17 · Derivatives 2026-09-18", { exact: false }).waitFor({ state: "visible", timeout: 90_000 });
assert.equal(await outlook.getAttribute("data-tone"), "positive");
assert.match((await outlook.innerText()).replace(/\s+/g, " "), /E Sell.*F Buy.*O Buy.*Sideways \(Bullish\)/);
const style = await outlook.evaluate((element) => {
  const computed = getComputedStyle(element);
  return { backgroundColor: computed.backgroundColor, color: computed.color };
});
assert.equal(style.backgroundColor, "rgb(220, 252, 231)");

const screenshot = path.join(outputDir, "desktop-morning-latest-cash-outlook.png");
await page.screenshot({ path: screenshot, fullPage: true });
const result = { passed: true, summary, style, screenshot, url: page.url() };
await fs.writeFile(path.join(outputDir, "results.json"), `${JSON.stringify(result, null, 2)}\n`);
await browser.close();
console.log(JSON.stringify(result, null, 2));
