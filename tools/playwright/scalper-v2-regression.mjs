import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const appOrigin = process.env.SCALPER_V2_APP_ORIGIN ?? "http://127.0.0.1:15174";
const authOrigin = process.env.SCALPER_V2_AUTH_ORIGIN ?? "https://n50.nifty50today.co.in";
const output = path.resolve(process.env.SCALPER_V2_OUTPUT ?? "output/playwright/scalper-v2-20260910");
const password = (await fs.readFile(process.env.PLAYWRIGHT_ENV_FILE ?? ".env", "utf8"))
  .split(/\r?\n/).find((line) => line.startsWith("DEV_LOCAL_AUTH_PASSWORD="))?.split("=").slice(1).join("=").trim();
if (!password) throw new Error("Protected browser-test password is unavailable");
await fs.mkdir(path.join(output, "screenshots"), { recursive: true });
const results = [];
const check = (name, pass, detail = "") => results.push({ name, pass: Boolean(pass), detail });
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: "reduce" });
  const login = await context.request.post(`${authOrigin}/n50/auth/session/dev-login`, { data: { identifier: "admin", password }, headers: { Origin: authOrigin } });
  check("authenticated session", login.ok(), `HTTP ${login.status()}`);
  const session = (await context.storageState()).cookies.find((cookie) => cookie.name.includes("session"));
  if (new URL(appOrigin).hostname === "127.0.0.1" && session) await context.addCookies([{ ...session, domain: "127.0.0.1", path: "/", secure: false, sameSite: "Lax" }]);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => { if (message.type() === "error" && !message.text().includes("clarity.ms")) errors.push(message.text()); });
  const started = performance.now();
  await page.goto(`${appOrigin}/n50/strategy/trading-analytics?view=scalper_v2&interval=5`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  const terminal = page.getByTestId("scalper-v2");
  await terminal.waitFor({ state: "visible", timeout: 90_000 });
  const firstPaintMs = Math.round(performance.now() - started);
  await page.waitForTimeout(1_000);
  check("distinct V2 route", new URL(page.url()).searchParams.get("view") === "scalper_v2");
  check("V1 and V2 tabs visible", await page.getByRole("button", { name: "Scalper", exact: true }).isVisible() && await page.getByRole("button", { name: "Scalper V2", exact: true }).isVisible());
  check("three price charts", await terminal.locator('[class*="chartPanel"]').count() === 3);
  const prices = terminal.locator('[class*="premium"] strong');
  check("two prominent premiums", await prices.count() === 2 && (await prices.evaluateAll((nodes) => nodes.every((node) => Number.parseFloat(getComputedStyle(node).fontSize) >= 24))));
  check("four analytics charts", await terminal.locator('[class*="analyticCard"]').count() === 4);
  check("OI leaders visible", await terminal.locator('[class*="leader"]').count() >= 2);
  check("read-only and V7 status", /Read-only research/.test(await terminal.innerText()) && /V7 signals/.test(await terminal.innerText()));
  const switchStarted = performance.now();
  await terminal.getByRole("button", { name: "1m", exact: true }).click();
  await terminal.getByRole("button", { name: "1m", exact: true }).waitFor({ state: "visible" });
  await page.waitForTimeout(250);
  const switchMs = Math.round(performance.now() - switchStarted);
  check("timeframe URL updates", new URL(page.url()).searchParams.get("interval") === "1", `${switchMs}ms after background preload`);
  check("no horizontal page overflow", await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
  check("no page errors", errors.length === 0, errors.join(" | "));
  await page.screenshot({ path: path.join(output, "screenshots", "desktop-1920x1080.png"), fullPage: true });
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1366, height: 768 }]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(150);
    check(`${viewport.width} layout keeps three charts`, await terminal.locator('[class*="chartPanel"]').count() === 3);
    check(`${viewport.width} no horizontal overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
    await page.screenshot({ path: path.join(output, "screenshots", `desktop-${viewport.width}x${viewport.height}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.getByTestId("scalper-v2").waitFor({ state: "visible", timeout: 90_000 });
  check("mobile stacks charts", await terminal.locator('[class*="chartPanel"]').count() === 3);
  check("mobile no horizontal overflow", await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
  await page.screenshot({ path: path.join(output, "screenshots", "mobile-390x844.png"), fullPage: true });
  await fs.writeFile(path.join(output, "results.json"), JSON.stringify({ appOrigin, firstPaintMs, switchMs, results }, null, 2));
} finally { await browser.close(); }
const failed = results.filter((result) => !result.pass);
console.log(JSON.stringify({ checks: results.length, passed: results.length - failed.length, failed }, null, 2));
if (failed.length) process.exitCode = 1;
