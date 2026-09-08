import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright";

const base = (process.env.PLAYWRIGHT_BASE_URL ?? "https://n50.nifty50today.co.in/n50").replace(/\/$/, "");
const root = path.resolve(process.env.TERMINAL_PACKAGE_OUTPUT ?? "/home/novius2/NIFTY50/UI/ALIGNED_TERMINAL_ACCEPTANCE_PACKAGE_20260908");
const screenshots = path.join(root, "screenshots");
const raw = path.join(root, "raw-validation");
const envFile = process.env.PLAYWRIGHT_ENV_FILE ?? "/home/novius2/trading-stack/.env";
let password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
if (!password) {
  const env = await fs.readFile(envFile, "utf8");
  password = env.split(/\r?\n/).find((line) => line.startsWith("DEV_LOCAL_AUTH_PASSWORD="))?.split("=").slice(1).join("=").trim();
}
if (!password) throw new Error("Protected browser-test password is unavailable");
await fs.mkdir(screenshots, { recursive: true });
await fs.mkdir(raw, { recursive: true });

const checks = [];
const captures = [];
const runtimeErrors = [];
const check = (name, pass, detail = null) => {
  checks.push({ name, pass: Boolean(pass), detail });
  if (!pass) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
};
const knownNoise = (message) =>
  (message.includes("clarity.ms/collect") && message.includes("Content Security Policy")) ||
  (message.includes("static.cloudflareinsights.com/beacon.min.js") && message.includes("Content Security Policy")) ||
  message === "Failed to load resource: net::ERR_NETWORK_CHANGED";
const capture = async (page, name, fullPage = true) => {
  const file = path.join(screenshots, `${name}.png`);
  await page.screenshot({ path: file, fullPage, animations: "disabled" });
  const bytes = await fs.readFile(file);
  captures.push({
    file: path.relative(root, file),
    bytes: bytes.length,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    viewport: page.viewportSize(),
    fullPage,
  });
};
const authenticate = async (context) => {
  const login = await context.request.post(`${base}/auth/session/dev-login`, {
    data: { identifier: "admin", password },
    headers: { Origin: new URL(base).origin },
  });
  check("authenticated test session", login.ok(), `HTTP ${login.status()}`);
};

const browser = await chromium.launch({ headless: true });
let chartSummary = null;
try {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: "reduce", extraHTTPHeaders: { "Cache-Control": "no-cache" } });
  await authenticate(context);
  const page = await context.newPage();
  page.on("pageerror", (error) => runtimeErrors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error" && !knownNoise(message.text())) runtimeErrors.push(`${message.text()} · ${message.location().url || "unknown source"}`);
  });
  let chartPayload = null;
  page.on("response", async (response) => {
    if (response.ok() && response.url().includes("/v1/trading-analytics/charts?")) {
      try { chartPayload = await response.json(); } catch { /* response may be consumed during navigation */ }
    }
  });

  await page.goto(`${base}/strategy/trading-analytics?view=scalper&interval=5`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const terminal = page.getByTestId("aligned-scalper-terminal");
  await terminal.waitFor({ state: "visible", timeout: 60_000 });
  await page.getByText("Loading retained minute paths…", { exact: true }).waitFor({ state: "hidden", timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(1_000);
  check("aligned renderer is default", await page.getByLabel("Scalper renderer").inputValue() === "aligned");
  const intervalSelect = page.getByRole("combobox", { name: /^Interval/ });
  const rangeSelect = page.getByRole("combobox", { name: /^Chart range/ });
  check("five-minute interval is default", await intervalSelect.inputValue() === "5");
  check("one-day range is default", await rangeSelect.inputValue() === "day");
  check("five synchronized chart panes render", await terminal.locator("canvas").count() >= 5);
  check("fifth evidence pane is visible inside chart viewport", await terminal.evaluate((node) => {
    const region = node.querySelector('[aria-label="Aligned NIFTY, exact call, exact put and evidence panes"]');
    const label = node.querySelector('[data-testid="aligned-pane-label-4"]');
    if (!(region instanceof HTMLElement) || !(label instanceof HTMLElement)) return false;
    const outer = region.getBoundingClientRect();
    const inner = label.getBoundingClientRect();
    return inner.top >= outer.top && inner.bottom <= outer.bottom;
  }));
  const terminalText = await terminal.innerText();
  for (const label of ["EXACT CE", "EXACT PE", "OUTSTANDING OI", "SIGNED INTERVAL ΔOI", "IMPLIED VOLATILITY", "OI PCR", "RSI 14", "MACD 12/26/9", "NEAREST PAIRS", "SOURCE HEALTH"]) {
    check(`terminal exposes ${label}`, terminalText.includes(label));
  }
  check("no desktop horizontal page overflow", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
  check("aligned workstation fits one desktop viewport", await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 2), await page.evaluate(() => `${document.documentElement.scrollHeight}px document / ${innerHeight}px viewport`));
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await capture(page, "01-aligned-terminal-full-page-1920x1080");
  await terminal.screenshot({ path: path.join(screenshots, "02-aligned-terminal-chart-and-inspector-1920x1080.png"), animations: "disabled" });
  {
    const file = path.join(screenshots, "02-aligned-terminal-chart-and-inspector-1920x1080.png");
    const bytes = await fs.readFile(file);
    captures.push({ file: path.relative(root, file), bytes: bytes.length, sha256: crypto.createHash("sha256").update(bytes).digest("hex"), viewport: page.viewportSize(), fullPage: false });
  }

  const cursorPrompt = terminal.getByText("move cursor", { exact: true });
  const chartSurface = terminal.getByRole("region", { name: "Aligned NIFTY, exact call, exact put and evidence panes" });
  const chartBox = await chartSurface.boundingBox();
  if (chartBox) await page.mouse.move(chartBox.x + Math.min(260, chartBox.width * .22), chartBox.y + 90, { steps: 8 });
  await page.waitForTimeout(250);
  check("shared cursor inspector responds", !(await cursorPrompt.isVisible().catch(() => true)));
  await capture(page, "03-synchronized-cursor-evidence-1920x1080", false);

  await page.getByText(/^Measure A→B$/).click();
  await page.getByRole("button", { name: "Fix pair", exact: true }).click();
  const start = page.locator('select[aria-label="Measurement start time"]:visible').first();
  const end = page.locator('select[aria-label="Measurement end time"]:visible').first();
  await start.selectOption({ index: 1 });
  const endOptions = await end.locator("option").count();
  await end.selectOption({ index: endOptions - 1 });
  await page.waitForTimeout(300);
  check("A uses selected candle open", await start.inputValue() !== "");
  check("B uses selected candle close", await end.inputValue() !== "");
  check("measurement result appears in inspector", (await terminal.innerText()).includes("Long CE + PE"));
  check("measurement rectangle is rendered", await page.getByTestId("aligned-measurement-boxes").locator("span").count() >= 1);
  await capture(page, "04-fixed-pair-A-open-B-close-measurement-1920x1080");

  await page.getByLabel("Scalper renderer").selectOption("classic");
  await page.waitForTimeout(800);
  check("classic renderer rollback mounts", await page.getByTestId("aligned-scalper-terminal").count() === 0 && await page.locator("main canvas").count() >= 1);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await capture(page, "05-classic-echarts-preservation-1920x1080");

  await page.getByLabel("Scalper renderer").selectOption("aligned");
  await intervalSelect.selectOption("1");
  await terminal.waitFor({ state: "visible", timeout: 60_000 });
  await page.waitForTimeout(900);
  check("one-minute mode loads", await intervalSelect.inputValue() === "1");
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await capture(page, "06-aligned-terminal-one-minute-full-page-1920x1080");

  await page.goto(`${base}/strategy/trading-analytics?view=smartapi`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.getByRole("heading", { name: "NIFTY SmartAPI OI & Quotes" }).waitFor({ timeout: 60_000 });
  const oiMeasure = page.getByLabel("OI chart measure");
  await oiMeasure.selectOption("open_interest");
  await page.waitForTimeout(500);
  check("OI chart appears before table", await page.locator("main canvas").count() >= 1 && await page.getByRole("table").count() >= 1);
  await capture(page, "07-OI-PCR-current-open-interest-full-page-1920x1080");
  await oiMeasure.selectOption("previous_snapshot_delta");
  await page.waitForTimeout(300);
  await capture(page, "08-OI-PCR-change-in-OI-full-page-1920x1080");

  await page.goto(`${base}/strategy/trading-analytics?view=structure`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.locator("main").waitFor({ timeout: 60_000 });
  await page.waitForTimeout(700);
  await capture(page, "09-market-structure-level-evidence-full-page-1920x1080");

  await page.goto(`${base}/strategy/trading-analytics?view=morning`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.getByRole("heading", { name: "Daily FII/FPI & DII · cash segment" }).waitFor({ timeout: 60_000 });
  await page.waitForTimeout(500);
  check("morning cash FII and DII evidence renders", await page.getByRole("rowheader", { name: "FII/FPI", exact: true }).count() === 1 && await page.getByRole("rowheader", { name: "DII", exact: true }).count() === 1);
  await capture(page, "10-morning-FII-DII-and-market-context-full-page-1920x1080");

  await page.goto(`${base}/strategy/trading-analytics?view=stock`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.getByRole("heading", { name: "Stock Activity" }).waitFor({ timeout: 60_000 });
  await capture(page, "11-stock-activity-availability-full-page-1920x1080");

  await page.goto(`${base}/strategy/trading-analytics?view=replay`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.getByRole("heading", { name: "Retained-source as-of inspection" }).waitFor({ timeout: 60_000 });
  await capture(page, "12-history-and-replay-full-page-1920x1080");

  const axe = await new AxeBuilder({ page }).include("main").analyze();
  await fs.writeFile(path.join(raw, "axe-desktop.json"), `${JSON.stringify(axe.violations, null, 2)}\n`);
  check("desktop main accessibility scan", axe.violations.length === 0, `${axe.violations.length} violations`);

  chartSummary = chartPayload ? {
    limitations: chartPayload.limitations ?? [],
    panes: (chartPayload.panes ?? []).map((pane) => ({
      symbol: pane.identity?.tradingsymbol ?? null,
      sourceMinuteCount: pane.sourceMinuteCount ?? null,
      renderedBars: pane.bars?.length ?? 0,
      oiHistoryRows: pane.oiHistory?.length ?? 0,
      coverageRows: pane.coverage?.length ?? 0,
      firstBar: pane.bars?.[0]?.end ?? null,
      lastBar: pane.bars?.at(-1)?.end ?? null,
    })),
  } : null;
  await context.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce", extraHTTPHeaders: { "Cache-Control": "no-cache" } });
  await authenticate(mobile);
  const mobilePage = await mobile.newPage();
  mobilePage.on("pageerror", (error) => runtimeErrors.push(String(error)));
  mobilePage.on("console", (message) => {
    if (message.type() === "error" && !knownNoise(message.text())) runtimeErrors.push(`${message.text()} · ${message.location().url || "unknown source"}`);
  });
  await mobilePage.goto(`${base}/strategy/trading-analytics?view=scalper&interval=5&chartExpiry=2026-09-08&strike=23650&pin=true`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await mobilePage.getByTestId("aligned-scalper-terminal").waitFor({ state: "visible", timeout: 60_000 });
  await mobilePage.waitForTimeout(700);
  check("mobile has no page horizontal overflow", await mobilePage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
  check("mobile keeps aligned evidence", (await mobilePage.getByTestId("aligned-scalper-terminal").innerText()).includes("A → B MEASUREMENT"));
  await capture(mobilePage, "13-mobile-aligned-terminal-full-page-390x844");
  const mobileAxe = await new AxeBuilder({ page: mobilePage }).include("main").analyze();
  await fs.writeFile(path.join(raw, "axe-mobile.json"), `${JSON.stringify(mobileAxe.violations, null, 2)}\n`);
  check("mobile main accessibility scan", mobileAxe.violations.length === 0, `${mobileAxe.violations.length} violations`);
  await mobile.close();
  check("no application runtime errors", runtimeErrors.length === 0, runtimeErrors.join(" | "));
} finally {
  await browser.close();
  const result = {
    generatedAt: new Date().toISOString(),
    base,
    checks,
    passed: checks.filter((item) => item.pass).length,
    failed: checks.filter((item) => !item.pass).length,
    runtimeErrors,
    chartSummary,
    captures,
  };
  await fs.writeFile(path.join(raw, "acceptance-results.json"), `${JSON.stringify(result, null, 2)}\n`);
  await fs.writeFile(path.join(raw, "screenshot-manifest.json"), `${JSON.stringify(captures, null, 2)}\n`);
}
console.log(JSON.stringify({ root, checks: checks.length, passed: checks.filter((item) => item.pass).length, screenshots: captures.length }));
