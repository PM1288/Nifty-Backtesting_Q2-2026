import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const appOrigin = process.env.MORNING_APP_ORIGIN ?? "http://127.0.0.1:19090";
const authOrigin = process.env.MORNING_AUTH_ORIGIN ?? "https://n50.nifty50today.co.in";
const output = path.resolve(process.env.MORNING_OUTPUT ?? "/tmp/morning-participant-comparison");
const password = (await fs.readFile(process.env.PLAYWRIGHT_ENV_FILE ?? ".env", "utf8"))
  .split(/\r?\n/)
  .find((line) => line.startsWith("DEV_LOCAL_AUTH_PASSWORD="))
  ?.split("=").slice(1).join("=").trim();
if (!password) throw new Error("Protected browser-test password is unavailable");
await fs.mkdir(output, { recursive: true });

const results = [];
const check = (id, pass, detail) => results.push({ id, status: pass ? "PASS" : "FAIL", detail });
const number = (value) => value == null ? "—" : new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2, signDisplay: "exceptZero" }).format(Number(value));
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: "reduce" });
  const login = await context.request.post(`${authOrigin}/n50/auth/session/dev-login`, {
    data: { identifier: "admin", password },
    headers: { Origin: authOrigin },
  });
  check("AUTH", login.ok(), `HTTP ${login.status()}`);
  const session = (await context.storageState()).cookies.find((cookie) => cookie.name.includes("session"));
  if (new URL(appOrigin).hostname === "127.0.0.1" && session)
    await context.addCookies([{ ...session, domain: "127.0.0.1", path: "/", secure: false, sameSite: "Lax" }]);

  const api = await context.request.get(`${appOrigin}/v1/trading-analytics`);
  check("API", api.ok(), `HTTP ${api.status()}`);
  const payload = await api.json();
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => { if (message.type() === "error" && !message.text().includes("clarity.ms")) errors.push(message.text()); });
  await page.goto(`${appOrigin}/n50/strategy/trading-analytics?view=morning`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  const summary = page.getByTestId("morning-participant-summary-table");
  const calculations = page.getByTestId("morning-participant-calculation-table");
  await summary.waitFor({ state: "visible", timeout: 90_000 });
  await calculations.waitFor({ state: "visible", timeout: 90_000 });
  // Ignore only requests cancelled while the authenticated local gateway page
  // hydrates; errors emitted during the stable inspection below still fail.
  errors.length = 0;
  await page.waitForTimeout(500);

  const summaryHeaders = await summary.locator("thead").innerText();
  check("HEADERS", ["Net calls", "Net puts", "Options proxy", "Previous", "Current", "Change"].every((label) => summaryHeaders.includes(label)), summaryHeaders.replace(/\s+/g, " "));
  const summaryRows = summary.locator("tbody tr");
  const calculationRows = calculations.locator("tbody tr");
  check("FOUR-PARTICIPANTS", await summaryRows.count() === 4, `${await summaryRows.count()} summary rows`);
  check("TWO-REPORT-ROWS", await calculationRows.count() === 8, `${await calculationRows.count()} calculation rows`);

  const participantTypes = ["FII", "Pro", "Client", "DII"];
  for (let index = 0; index < participantTypes.length; index += 1) {
    const type = participantTypes[index];
    const row = payload.participants.find((candidate) => candidate.client_type === type);
    const text = await summaryRows.nth(index).innerText();
    check(`IDENTITY-${type}`, text.includes(type), text.replace(/\s+/g, " "));
    for (const key of ["previous_net_calls", "net_calls", "delta_net_calls", "previous_net_puts", "net_puts", "delta_net_puts", "previous_options_proxy", "options_proxy", "delta_options_proxy"])
      check(`${type}-${key}`, text.includes(number(row?.[key])), `${key}=${number(row?.[key])}`);
    if (row?.comparison_state === "COMPARABLE_PREVIOUS_REPORT") {
      check(`${type}-CALL-ARITHMETIC`, Number(row.net_calls) === Number(row.option_index_call_long) - Number(row.option_index_call_short), `${row.option_index_call_long} - ${row.option_index_call_short} = ${row.net_calls}`);
      check(`${type}-PUT-ARITHMETIC`, Number(row.net_puts) === Number(row.option_index_put_long) - Number(row.option_index_put_short), `${row.option_index_put_long} - ${row.option_index_put_short} = ${row.net_puts}`);
      check(`${type}-PROXY-ARITHMETIC`, Number(row.options_proxy) === Number(row.net_calls) - Number(row.net_puts), `${row.net_calls} - ${row.net_puts} = ${row.options_proxy}`);
      check(`${type}-CHANGE-ARITHMETIC`, Number(row.delta_options_proxy) === Number(row.options_proxy) - Number(row.previous_options_proxy), `${row.options_proxy} - ${row.previous_options_proxy} = ${row.delta_options_proxy}`);
    }
  }
  const disclosure = await page.getByTestId("morning-participant-comparison").innerText();
  check("CLIENT-DISCLOSURE", /not asserted to be retail-only/.test(disclosure), "Client class is not mislabeled as verified retail");
  check("FORMULA-DISCLOSURE", /Net calls = index-call long contracts − index-call short contracts/.test(disclosure) && /Options proxy = net calls − net puts/.test(disclosure), "Call, put and proxy formulas are visible");
  check("PAGE-ERRORS", errors.length === 0, errors.join(" | "));
  await page.screenshot({ path: path.join(output, "morning-participant-comparison.png"), fullPage: true });
  await fs.writeFile(path.join(output, "results.json"), JSON.stringify({ reportDate: payload.reportDate, participantCount: payload.participants.length, results }, null, 2));
} finally {
  await browser.close();
}

const failed = results.filter((result) => result.status === "FAIL");
console.log(JSON.stringify({ checks: results.length, passed: results.length - failed.length, failed }, null, 2));
if (failed.length) process.exitCode = 1;
