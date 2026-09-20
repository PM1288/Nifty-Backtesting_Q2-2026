#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const requireFromTools = createRequire(path.join(repoRoot, "tools/playwright/package.json"));
const { chromium } = requireFromTools("playwright");
const baseUrl = (process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:19090/n50").replace(/\/$/, "");
const apiBaseUrl = (process.env.PLAYWRIGHT_API_BASE_URL ?? baseUrl).replace(/\/$/, "");
const outputDir = path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR ?? "output/playwright/header-today-outlook");
const envFile = process.env.PLAYWRIGHT_ADMIN_PASSWORD_FILE;
let password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
if (!password && envFile) {
  const rawEnv = await fs.readFile(envFile, "utf8");
  const passwordLine = rawEnv.split(/\r?\n/).find((line) => line.startsWith("DEV_LOCAL_AUTH_PASSWORD="));
  password = passwordLine?.slice(passwordLine.indexOf("=") + 1).trim().replace(/^(["'])(.*)\1$/, "$2");
}
if (!password) throw new Error("Supply PLAYWRIGHT_ADMIN_PASSWORD or PLAYWRIGHT_ADMIN_PASSWORD_FILE");

await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const bootstrap = await browser.newContext();
const login = await bootstrap.request.post(`${apiBaseUrl}/auth/session/dev-login`, {
  data: { identifier: "admin", password },
});
if (!login.ok()) throw new Error(`Authorised login failed with HTTP ${login.status()}`);
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

const results = [];
for (const viewport of [
  { name: "desktop-1920x1080", width: 1920, height: 1080 },
  { name: "mobile-390x844", width: 390, height: 844 },
]) {
  const context = await browser.newContext({ viewport, storageState, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.route("**/v1/trading-analytics/morning-summary**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      asOf: "2026-09-20T04:00:00.000Z",
      reportDate: "2026-09-19",
      equity: "Buy",
      futures: "Buy",
      options: "Buy",
      equityNet: "125.50",
      futuresNet: "264.47",
      optionsNet: "4404.77",
      matrix: "Super Bullish",
      knowledgeState: "CASH_PUBLICATION_TIME_UNVERIFIED",
    }),
  }));
  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  const header = page.locator("header").first();
  const outlook = page.getByTestId("header-today-outlook");
  try {
    await outlook.waitFor({ state: "visible" });
  } catch (error) {
    await page.screenshot({ path: path.join(outputDir, `${viewport.name}-failure.png`) });
    throw new Error(`Header unavailable at ${viewport.name}; url=${page.url()}; title=${await page.title()}; body=${(await page.locator("body").innerText()).slice(0, 300)}`, { cause: error });
  }
  const visibleText = (await header.innerText()).replace(/\s+/g, " ");
  const checks = {
    n50Brand: await header.getByText("N50", { exact: true }).isVisible(),
    outlookVisible: await outlook.isVisible(),
    canonicalResult: (await outlook.innerText()).includes("Super Bullish"),
    valuesVisibleOnDesktop: viewport.width < 768 || /125\.50.*264\.47.*4,404\.77/s.test((await outlook.innerText()).replace(/\s+/g, " ")),
    noOldBrand: !visibleText.includes("NIFTY 50 TRADER"),
    noMarketClosed: !visibleText.includes("Market closed"),
    noPaperBadge: !/\bPAPER\b/.test(visibleText),
    noReadyText: !/\bREADY\b/.test(visibleText),
    noVoiceText: !/\b(Speak|Muted)\b/.test(visibleText),
    noHorizontalOverflow: await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  };
  await page.screenshot({ path: path.join(outputDir, `${viewport.name}.png`) });
  results.push({ viewport: viewport.name, checks });
  await context.close();
}
await browser.close();
await fs.writeFile(path.join(outputDir, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
const failures = results.flatMap((result) => Object.entries(result.checks).filter(([, passed]) => !passed).map(([name]) => `${result.viewport}: ${name}`));
if (failures.length) throw new Error(`Header regression failed:\n${failures.join("\n")}`);
console.log(JSON.stringify({ passed: true, results, outputDir }, null, 2));
