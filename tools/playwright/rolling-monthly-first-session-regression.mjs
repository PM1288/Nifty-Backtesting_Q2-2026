import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const origin = (process.env.PLAYWRIGHT_ORIGIN ?? "http://127.0.0.1:19090").replace(/\/$/, "");
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
const outputDir = path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR ?? "output/playwright/rolling-monthly-first-session-20260818");
if (!password) throw new Error("PLAYWRIGHT_ADMIN_PASSWORD is required");
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const results = [];
function check(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}: ${detail}`);
}

try {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const login = await context.request.post(`${origin}/auth/session/dev-login`, { data: { identifier: "admin", password } });
  check("admin login", login.ok(), `status=${login.status()}`);
  const page = await context.newPage();
  const appErrors = [];
  page.on("response", (response) => {
    if (response.status() >= 400 && /\/n50\/(v1|auth)\//.test(response.url())) appErrors.push(`${response.status()} ${response.url()}`);
  });
  const response = await page.goto(`${origin}/n50/strategy/rolling-monthly?view=absolute-first-session&threshold=0.20`, { waitUntil: "networkidle", timeout: 60_000 });
  check("route", Boolean(response?.ok()), `status=${response?.status()}`);
  await page.getByRole("heading", { name: "Completed month and week setup → first-session execution" }).waitFor();
  check("isolated tab active", await page.getByRole("button", { name: "Absolute first session" }).getAttribute("data-active") === "true", "tab inactive");
  check("threshold options", await page.getByLabel("Significant gap-up").locator("option").count() === 2, "0.20/0.30 options missing");
  const payload = await page.evaluate(async () => {
    const response = await fetch("/n50/v1/rolling-monthly/absolute-first-session?threshold=0.20", { credentials: "include" });
    return { status: response.status, body: await response.json() };
  });
  check("api", payload.status === 200, `status=${payload.status}`);
  check("strategy version", payload.body.strategyVersion === "absolute_monthly_first_session_gap_fill_long_v1", payload.body.strategyVersion);
  check("real rows", payload.body.candidates.length > 0, "no scenarios");
  const entered = payload.body.candidates.filter((row) => row.entry_status === "ENTERED" && row.evaluation_status !== "INCOMPLETE");
  const sum = (field) => entered.reduce((total, row) => total + Number(row[field] ?? 0), 0);
  check("one-share final reconciles", Math.abs(sum("profit_per_share") - Number(payload.body.totals.one_share_end_pnl ?? 0)) < 0.01, `${sum("profit_per_share")} != ${payload.body.totals.one_share_end_pnl}`);
  check("one-share maximum reconciles", Math.abs(sum("max_profit_per_share") - Number(payload.body.totals.one_share_max_profit ?? 0)) < 0.01, "maximum mismatch");
  check("one-share drawdown reconciles", Math.abs(sum("max_drawdown_per_share") - Number(payload.body.totals.one_share_max_drawdown ?? 0)) < 0.01, "drawdown mismatch");
  check("10k final reconciles", Math.abs(sum("end_pnl_10000") - Number(payload.body.totals.end_pnl_10000 ?? 0)) < 0.01, "10k final mismatch");
  check("whole-share sizing", payload.body.candidates.every((row) => Number.isInteger(Number(row.quantity_10000)) && Number(row.quantity_10000) >= 0), "fractional/negative quantity");
  check("unfilled suppressed", payload.body.candidates.filter((row) => row.entry_status === "NOT_ENTERED_GAP_UNFILLED").every((row) => row.entry_price == null && row.end_return_pct == null), "unfilled gap has invented result");
  const evaluable = payload.body.candidates.filter((row) => row.entry_status === "ENTERED" && row.evaluation_status !== "INCOMPLETE");
  check("threshold contract", JSON.stringify(payload.body.performanceThresholdsPct) === JSON.stringify([1, 2, 3, 5, 10]), JSON.stringify(payload.body.performanceThresholdsPct));
  check("evaluable denominator", Number(payload.body.totals.path_evaluable) === evaluable.length, `${payload.body.totals.path_evaluable} != ${evaluable.length}`);
  for (const threshold of payload.body.performanceThresholdsPct) {
    const favourable = evaluable.filter((row) => Number(row.max_profit_pct) >= threshold).length;
    const adverse = evaluable.filter((row) => Number(row.max_drawdown_pct) <= -threshold).length;
    check(`favourable +${threshold}%`, Number(payload.body.totals[`profit_target_${threshold}_count`]) === favourable, `${payload.body.totals[`profit_target_${threshold}_count`]} != ${favourable}`);
    check(`drawdown -${threshold}%`, Number(payload.body.totals[`drawdown_${threshold}_count`]) === adverse, `${payload.body.totals[`drawdown_${threshold}_count`]} != ${adverse}`);
  }
  const thresholdSection = page.getByRole("region", { name: "First-session favourable target attainment and drawdown incidence" });
  check("number KPI ladders", await thresholdSection.locator("article").count() === 10, `cards=${await thresholdSection.locator("article").count()}`);
  check("table rendered", await page.locator("table tbody tr").count() > 0, "table empty");
  for (const heading of ["M−2 RED", "M−1 GREEN + CROSSOVER", "COMPLETED-WEEK VALIDATORS", "FIRST-SESSION GAP", "₹10,000 SCENARIO"]) {
    check(`column ${heading}`, (await page.locator("table thead").innerText()).includes(heading), `${heading} missing`);
  }
  const colouredRows = page.locator("tr[data-entry-status]");
  check("all evidence rows highlighted", await colouredRows.count() === payload.body.candidates.length, `rows=${await colouredRows.count()} candidates=${payload.body.candidates.length}`);
  if (payload.body.candidates.some((row) => row.entry_status === "NOT_ENTERED_GAP_UNFILLED")) {
    const grey = await colouredRows.filter({ has: page.getByText("Not entered", { exact: true }) }).first().evaluate((node) => getComputedStyle(node).backgroundColor);
    check("not-entered rows grey", grey === "rgb(238, 242, 246)", grey);
  }
  check("return scale visible", await page.getByLabel("Row colour scale from minus ten to plus ten percent final return").count() === 1, "row scale missing");
  await thresholdSection.screenshot({ path: path.join(outputDir, "absolute-first-session-threshold-kpis.png") });
  await page.getByLabel("Row colour scale from minus ten to plus ten percent final return").scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(outputDir, "absolute-first-session-row-scale-and-table.png") });
  await page.locator("table tbody tr button").first().click();
  await page.getByRole("dialog", { name: /candlestick chart/ }).waitFor();
  const chartEvidence = page.getByLabel("Absolute first-session entry and outcome");
  await chartEvidence.waitFor();
  check("chart evidence", await chartEvidence.locator("article[data-selected='true']").count() === 1, "selected chart evidence missing");
  await page.screenshot({ path: path.join(outputDir, "absolute-first-session-chart-1920x1080.png") });
  await page.getByRole("button", { name: "Close candlestick chart" }).click();
  await page.getByLabel("Significant gap-up").selectOption("0.30");
  await page.waitForURL(/threshold=0.30/);
  await page.getByText(/setup scenarios shown/).waitFor();
  check("threshold URL state", new URL(page.url()).searchParams.get("threshold") === "0.30", page.url());
  check("no app errors", appErrors.length === 0, appErrors.join(" | "));
  check("desktop overflow", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), "desktop body overflow");
  await page.screenshot({ path: path.join(outputDir, "absolute-first-session-1920x1080.png"), fullPage: true });

  const mobile = await context.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto(`${origin}/n50/strategy/rolling-monthly?view=absolute-first-session&threshold=0.20`, { waitUntil: "networkidle", timeout: 60_000 });
  await mobile.getByRole("heading", { name: "Completed month and week setup → first-session execution" }).waitFor();
  check("mobile overflow", await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), "mobile body overflow");
  const mobileThresholdSection = mobile.getByRole("region", { name: "First-session favourable target attainment and drawdown incidence" });
  await mobileThresholdSection.scrollIntoViewIfNeeded();
  await mobile.screenshot({ path: path.join(outputDir, "absolute-first-session-threshold-kpis-390x844.png") });
  await mobile.screenshot({ path: path.join(outputDir, "absolute-first-session-390x844.png"), fullPage: true });
  await context.close();
} finally {
  await browser.close();
  await fs.writeFile(path.join(outputDir, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
}

console.log(JSON.stringify({ checks: results.length, passed: results.filter((row) => row.passed).length, outputDir }, null, 2));
