import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const appOrigin = process.env.SCALPER_V2_APP_ORIGIN ?? "http://127.0.0.1:15186";
const authOrigin = process.env.SCALPER_V2_AUTH_ORIGIN ?? "http://127.0.0.1:19090";
const output = path.resolve(process.env.SCALPER_V2_OUTPUT ?? "/tmp/scalper-v2-reference-levels");
const injectFixture = process.env.SCALPER_V2_REFERENCE_FIXTURE === "true";
const envText = await fs.readFile(process.env.PLAYWRIGHT_ENV_FILE ?? ".env", "utf8");
const rawPassword = process.env.PLAYWRIGHT_ADMIN_PASSWORD ?? envText.split(/\r?\n/).find((line) => line.startsWith("DEV_LOCAL_AUTH_PASSWORD="))?.split("=").slice(1).join("=").trim();
const password = rawPassword?.replace(/^"|"$/g, "");
if (!password) throw new Error("Protected browser-test password is unavailable");
await fs.mkdir(output, { recursive: true });
const results = [];
const check = (name, pass, detail) => { results.push({ name, status: pass ? "PASS" : "FAIL", detail }); if (!pass) throw new Error(`${name}: ${detail}`); };
const istDate = (value) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: "reduce" });
  const login = await context.request.post(`${authOrigin}/n50/auth/session/dev-login`, { data: { identifier: "admin", password }, headers: { Origin: authOrigin } });
  check("Authenticated Scalper V2", login.ok(), `HTTP ${login.status()}`);
  const session = (await context.storageState()).cookies.find((cookie) => cookie.name.includes("session"));
  if (session && new URL(appOrigin).hostname === "127.0.0.1") await context.addCookies([{ ...session, domain: "127.0.0.1", path: "/", secure: false, sameSite: "Lax" }]);
  const page = await context.newPage();
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(String(error)));
  let observedContext = null;
  page.on("response", async (response) => {
    if (!response.url().includes("/v1/trading-analytics/scalper-context")) return;
    try { observedContext = await response.json(); } catch { /* surfaced by the visible-state checks */ }
  });
  if (injectFixture) await page.route("**/v1/trading-analytics/scalper-context**", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    const value = Number(body.smartapi?.spot?.ltp ?? 23_400);
    const sessionDate = istDate(body.smartapi?.spot?.exch_feed_time ?? body.smartapi?.spot?.ts ?? body.asOf);
    body.referenceLevels = { asOf: body.asOf, sessionDate, coverage: { completedDailyBars: 40, observedSessions: 41 }, levels: [
      { id: "current", label: "Current underlying", shortLabel: "NOW", value, sourceDate: sessionDate, source: "live_session" },
      { id: "today-open", label: "Today open", shortLabel: "D O", value: value - 1, sourceDate: sessionDate, source: "live_session" },
      { id: "previous-day-close", label: "Yesterday close", shortLabel: "D-1 C", value: value + 1, sourceDate: sessionDate, source: "daily_bar" },
      { id: "current-week-open", label: "Current week open", shortLabel: "W O", value: value - 500, sourceDate: sessionDate, source: "daily_bar" },
      { id: "current-month-open", label: "Current month open", shortLabel: "M O", value: value - 1_000, sourceDate: sessionDate, source: "daily_bar" },
      { id: "thirty-day-low", label: "30-session minimum", shortLabel: "30D MIN", value: value - 1_100, sourceDate: sessionDate, source: "derived_window" },
      { id: "thirty-day-high", label: "30-session maximum", shortLabel: "30D MAX", value: value + 1_100, sourceDate: sessionDate, source: "derived_window" },
    ] };
    await route.fulfill({ response, json: body });
  });
  await page.goto(`${appOrigin}/n50/strategy/trading-analytics?view=scalper_v2&interval=5`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  const terminal = page.getByTestId("scalper-v2");
  await terminal.waitFor({ state: "visible", timeout: 90_000 }).catch(async () => {
    throw new Error(`Scalper V2 did not mount: ${JSON.stringify({ url: page.url(), errors: browserErrors, body: (await page.locator("body").innerText()).slice(0, 2_000) })}`);
  });
  const gauge = page.getByTestId("v2-underlying-level-gauge");
  await gauge.waitFor({ state: "visible", timeout: 30_000 });
  const gaugeText = await gauge.innerText();
  check("Gauge lists current and period references", /NOW/.test(gaugeText) && /D O/.test(gaugeText) && /D-1 C/.test(gaugeText) && /W O/.test(gaugeText) && /M O/.test(gaugeText), gaugeText);
  const gaugeRange = await gauge.getByRole("img").evaluate((element) => ({ low: Number(element.dataset.rangeLow), high: Number(element.dataset.rangeHigh), strikeCount: Number(element.dataset.strikeCount) }));
  const referenceLevels = observedContext?.referenceLevels?.levels ?? [];
  const expectedLow = Number(referenceLevels.find((level) => level.id === "thirty-day-low")?.value);
  const expectedHigh = Number(referenceLevels.find((level) => level.id === "thirty-day-high")?.value);
  const expectedStrikes = [...new Set((observedContext?.smartapi?.strikes ?? []).map(Number).filter((strike) => Number.isFinite(strike) && strike >= expectedLow && strike <= expectedHigh))];
  check("Gauge domain is the exact 30-session low and high", gaugeRange.low === expectedLow && gaugeRange.high === expectedHigh, JSON.stringify({ gaugeRange, expectedLow, expectedHigh }));
  const renderedStrikes = (await page.getByTestId("v2-reference-strike-tick").allInnerTexts()).map((value) => Number(value.replaceAll(",", "")));
  check("Gauge labels every available strike inside the 30-session range", gaugeRange.strikeCount === expectedStrikes.length && JSON.stringify(renderedStrikes) === JSON.stringify(expectedStrikes), JSON.stringify({ gaugeRange, expectedStrikes, renderedStrikes }));
  const bodyState = await page.getByTestId("v2-chart-body-underlying").evaluate((element) => ({ low: Number(element.dataset.sessionLow), high: Number(element.dataset.sessionHigh), visible: element.dataset.referenceLevelsVisible?.split(",").filter(Boolean) ?? [], total: Number(element.dataset.referenceLevelsTotal) }));
  const expectedVisible = referenceLevels.filter((level) => level.id !== "current" && Number(level.value) >= bodyState.low && Number(level.value) <= bodyState.high).map((level) => level.id).sort();
  check("Chart receives reference levels but plots only raw-session-eligible levels", bodyState.total === referenceLevels.length && JSON.stringify([...bodyState.visible].sort()) === JSON.stringify(expectedVisible), JSON.stringify({ bodyState, expectedVisible }));
  const profile = page.getByTestId("v2-oi-profile");
  const collapsed = await profile.boundingBox();
  check("Delta OI legend starts compact", !await profile.getAttribute("open") && Number(collapsed?.height) <= 40, JSON.stringify(collapsed));
  await profile.hover(); await page.waitForTimeout(100);
  const expanded = await profile.boundingBox();
  check("Delta OI legend expands on hover", Number(expanded?.height) > Number(collapsed?.height) && /Negative/.test(await profile.innerText()), JSON.stringify({ collapsed, expanded }));
  await page.screenshot({ path: path.join(output, "scalper-v2-reference-levels.png"), fullPage: true });
  await fs.writeFile(path.join(output, "results.json"), JSON.stringify(results, null, 2));
} finally { await browser.close(); }
console.log(JSON.stringify({ passed: results.filter((row) => row.status === "PASS").length, total: results.length, output }));
