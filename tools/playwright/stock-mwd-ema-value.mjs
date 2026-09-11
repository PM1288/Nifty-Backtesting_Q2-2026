import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const base = (process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:15188/n50-stage").replace(/\/$/, "");
const authBase = process.env.PLAYWRIGHT_AUTH_BASE_URL ?? base.replace(/\/n50-stage$/, "");
const authOrigin = process.env.PLAYWRIGHT_AUTH_ORIGIN ?? "https://n50.nifty50today.co.in";
const output = process.env.PLAYWRIGHT_OUTPUT_DIR ?? "/tmp/stock-mwd-ema-value";
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
if (!password) throw new Error("PLAYWRIGHT_ADMIN_PASSWORD is required");
await fs.mkdir(output, { recursive: true });

const results = [];
function check(name, pass, detail) {
  results.push({ name, status: pass ? "PASS" : "FAIL", detail });
  if (!pass) throw new Error(`${name}: ${detail}`);
}

async function prepare(context) {
  const login = await context.request.post(`${authBase}/auth/session/dev-login`, {
    data: { identifier: "admin", password }, headers: { Origin: authOrigin },
  });
  check("Authenticated isolated candidate", login.ok(), `HTTP ${login.status()}`);
  const pair = (login.headers()["set-cookie"] ?? "").split(";", 1)[0];
  const separator = pair.indexOf("=");
  if (separator > 0) await context.addCookies([{
    name: pair.slice(0, separator), value: pair.slice(separator + 1),
    domain: new URL(base).hostname, path: "/", httpOnly: true, secure: false, sameSite: "Lax",
  }]);
  if (base !== authBase) {
    await context.route(`${base}/**`, async (route) => {
      const incoming = new URL(route.request().url());
      const upstream = `${authBase}${incoming.pathname.replace(/^\/n50-stage/, "")}${incoming.search}`;
      const response = await route.fetch({ url: upstream, timeout: 90_000 });
      await route.fulfill({ response });
    });
  }
}

const browser = await chromium.launch({ headless: true });
try {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  await prepare(desktop);
  const api = await desktop.request.get(`${authBase}/v1/stocks/RELIANCE?range=1D`);
  check("Live-backed 1D stock response", api.ok(), `HTTP ${api.status()}`);
  const payload = await api.json();
  check("Visible session and EMA warm-up are separate", payload.intraday?.length > 0 && payload.indicatorWarmup?.length > 0, `visible=${payload.intraday?.length ?? 0} warmup=${payload.indicatorWarmup?.length ?? 0}`);
  const inNseSession = (row) => {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(row.t));
    const minute = Number(parts.find((part) => part.type === "hour")?.value) * 60 + Number(parts.find((part) => part.type === "minute")?.value);
    return minute >= 9 * 60 + 15 && minute < 15 * 60 + 30;
  };
  check("Visible and warm-up bars are NSE-session observations", payload.intraday.every(inNseSession) && payload.indicatorWarmup.every(inNseSession), `visible=${payload.intraday.length} warmup=${payload.indicatorWarmup.length}`);
  check("Warm-up ends before visible session", Date.parse(payload.indicatorWarmup.at(-1).t) < Date.parse(payload.intraday[0].t), `${payload.indicatorWarmup.at(-1).t} < ${payload.intraday[0].t}`);

  const page = await desktop.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("requestfailed", (request) => {
    if (request.url().startsWith(authBase)) errors.push(`request: ${request.url()} ${request.failure()?.errorText ?? "failed"}`);
  });
  await page.goto(`${base}/analytics/stock/RELIANCE`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  const workspace = page.getByTestId("mwd-ema-value-drilldown");
  await workspace.waitFor({ state: "visible", timeout: 60_000 }).catch(async (error) => {
    await fs.writeFile(path.join(output, "desktop-timeout-body.txt"), (await page.locator("body").innerText()).slice(0, 20_000));
    await fs.writeFile(path.join(output, "desktop-timeout-errors.txt"), errors.join("\n"));
    await page.screenshot({ path: path.join(output, "desktop-timeout.png"), fullPage: true });
    throw error;
  });
  const text = await workspace.innerText();
  check("Only supplied technical methodology is named", ["15m open", "1H open", "Day open", "Week open", "Month open", "3M open", "Year open", "PDC", "1D ago open", "1W ago open", "1M ago open"].every((label) => text.includes(label)), text.slice(0, 1_500));
  check("Old technical chart is absent", !(await page.getByText(/Historical price, Bollinger bands, pivots, volume and RSI/i).count()) && !/BB upper|RSI 14/.test(text), text.slice(0, 500));
  check("Intraday candlestick canvas renders", await workspace.locator("canvas").count() >= 1, `canvases=${await workspace.locator("canvas").count()}`);
  const chart = workspace.getByRole("img", { name: /only the MWD EMA Value methodology/i });
  check("Structured chart alternative names the method", await chart.count() === 1, `matches=${await chart.count()}`);
  const rows = workspace.locator('button[role="listitem"]');
  check("All eleven drill-down levels render", await rows.count() === 11, `rows=${await rows.count()}`);
  const nonMissing = await rows.evaluateAll((items) => items.filter((item) => item.getAttribute("data-bias") !== "unavailable").length);
  check("Real levels resolve without fabricated zero", nonMissing >= 8, `resolved=${nonMissing}/11`);
  const month = rows.filter({ hasText: "Month open" }).first();
  await month.click();
  check("Selecting a level highlights only presentation", await month.getAttribute("data-selected") === "true", String(await month.getAttribute("data-selected")));
  check("No browser exceptions", errors.length === 0, errors.join(" | "));
  check("Desktop has no accidental horizontal overflow", await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), String(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)));
  await page.screenshot({ path: path.join(output, "stock-mwd-ema-value-desktop.png"), fullPage: true });
  await desktop.unrouteAll({ behavior: "ignoreErrors" });
  await desktop.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  await prepare(mobile);
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(`${base}/analytics/stock/RELIANCE`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  const mobileWorkspace = mobilePage.getByTestId("mwd-ema-value-drilldown");
  await mobileWorkspace.waitFor({ state: "visible", timeout: 60_000 });
  const boxes = await mobileWorkspace.locator(":scope > *").evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().toJSON()));
  check("Mobile stacks chart and level drill-down", boxes.length === 2 && boxes[1].top >= boxes[0].bottom - 1, JSON.stringify(boxes));
  check("Mobile has no accidental horizontal overflow", await mobilePage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), String(await mobilePage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)));
  await mobilePage.screenshot({ path: path.join(output, "stock-mwd-ema-value-mobile.png"), fullPage: true });
  await mobile.unrouteAll({ behavior: "ignoreErrors" });
  await mobile.close();
} finally {
  await browser.close();
  await fs.writeFile(path.join(output, "results.json"), JSON.stringify(results, null, 2));
}

console.log(JSON.stringify({ passed: results.length, total: results.length, output }));
