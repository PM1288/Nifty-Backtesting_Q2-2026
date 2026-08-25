import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = (process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:19090/n50").replace(/\/$/, "");
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
const outputDir = path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR ?? "output/playwright/rolling-monthly");
if (!password) throw new Error("PLAYWRIGHT_ADMIN_PASSWORD is required");

await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];

function check(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}: ${detail}`);
}

try {
  for (const viewport of [
    { name: "desktop-1920x1080", width: 1920, height: 1080 },
    { name: "mobile-390x844", width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    const login = await context.request.post(`${baseUrl}/auth/session/dev-login`, {
      data: { identifier: "admin", password },
    });
    check(`${viewport.name} login`, login.ok(), `status=${login.status()}`);

    const page = await context.newPage();
    const errors = [];
    page.on("console", (message) => { if (message.type() === "error" && !/cloudflareinsights/i.test(message.text())) errors.push(message.text()); });
    await page.goto(`${baseUrl}/strategy/rolling-monthly`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.getByRole("heading", { name: "Rolling Monthly", exact: true }).waitFor();
    if (viewport.width > 720) {
      const strategyLink = page
        .getByRole("navigation", { name: "Workspace navigation" })
        .getByRole("link", { name: /Strategy/ })
        .first();
      await strategyLink.hover();
      const strategyMenu = page.getByRole("menu", { name: "Strategy dashboards" });
      await strategyMenu.waitFor();
      check(`${viewport.name} Strategy hover menu`, await strategyMenu.isVisible(), "Strategy menu did not open on hover");
      check(`${viewport.name} OIIS destination`, await strategyMenu.getByRole("menuitem", { name: /OIIS Lab/ }).count() === 1, "OIIS destination missing");
      check(`${viewport.name} Rolling Monthly destination`, await strategyMenu.getByRole("menuitem", { name: /Rolling Monthly/ }).count() === 1, "Rolling Monthly destination missing");
    }
    const apiResult = await page.evaluate(async (url) => {
      const response = await fetch(url, { credentials: "include" });
      return { status: response.status, payload: await response.json() };
    }, `${baseUrl}/v1/rolling-monthly/dashboard`);
    check(`${viewport.name} API`, apiResult.status === 200, `status=${apiResult.status}`);
    const payload = apiResult.payload;
    check(`${viewport.name} independent identity`, payload.strategyFamily === "ROLLING_MONTHLY" && payload.independentFromOiis === true, JSON.stringify({ family: payload.strategyFamily, independent: payload.independentFromOiis }));
    check(`${viewport.name} no Paper Trading integration`, payload.paperTradingConnected === false, `paperTradingConnected=${payload.paperTradingConnected}`);
    check(
      `${viewport.name} real completed run`,
      payload.latestRun?.status === "COMPLETED"
        && ["VALID", "DEGRADED"].includes(payload.latestRun?.quality_status),
      JSON.stringify(payload.latestRun),
    );
    check(
      `${viewport.name} current signal model`,
      payload.latestRun?.signal_model === "CONFIRMED_CLOSE_NEXT_SESSION_OPEN"
        && payload.latestRun?.signal_information_cutoff === "SIGNAL_SESSION_CLOSE"
        && payload.latestRun?.entry_price_source === "NEXT_VALID_SESSION_OPEN",
      JSON.stringify({
        signalModel: payload.latestRun?.signal_model,
        cutoff: payload.latestRun?.signal_information_cutoff,
        entry: payload.latestRun?.entry_price_source,
      }),
    );
    check(`${viewport.name} full F&O run`, Number(payload.latestRun?.universe_size) >= 200, `universe=${payload.latestRun?.universe_size}`);
    check(`${viewport.name} independent copy`, await page.getByText("This is independent from OIIS.", { exact: false }).count() === 1, "independence statement missing");
    check(`${viewport.name} research boundary`, await page.getByText("No Paper Trading or broker-order connection", { exact: false }).count() >= 1, "paper/broker boundary missing");
    check(`${viewport.name} no paper action`, await page.getByRole("button", { name: /add paper trade|paper trade/i }).count() === 0, "paper action unexpectedly present");
    check(`${viewport.name} current decision`, await page.getByRole("heading", { name: /No High or Medium quality candidate for this run|quality candidates? qualified/ }).count() === 1, "decision hero missing");
    check(`${viewport.name} no contradictory entry copy`, await page.getByText("Entry checks passed", { exact: true }).count() === 0, "a rejected Low-band row claims entry checks passed");
    check(`${viewport.name} candidate rows`, await page.locator("tbody tr").count() > 0, "candidate evidence is empty");
    check(`${viewport.name} six expiry runs`, payload.expiryHistory?.anchor === "LAST_TUESDAY_MONTHLY_EXPIRY" && payload.expiryHistory?.months?.length === 6, JSON.stringify(payload.expiryHistory?.months));
    check(`${viewport.name} expiry candidates`, payload.expiryHistory?.candidates?.length > 0, "expiry candidates missing");
    await page.getByRole("button", { name: "Expiry journey" }).click();
    await page.getByRole("heading", { name: "Conditions then, quality then, position now" }).waitFor();
    check(`${viewport.name} latest expiry evidence`, await page.getByRole("heading", { name: "Original conditions and current path" }).count() === 1, "latest expiry evidence missing");
    check(`${viewport.name} six expiry performance`, await page.getByRole("heading", { name: "Monthly quality and outcome history" }).count() === 1, "six-expiry performance missing");
    check(`${viewport.name} expiry outcome labels`, await page.getByText("successful", { exact: true }).count() >= 6 && await page.getByText("failed", { exact: true }).count() >= 6, "monthly success/failure labels missing");
    await page.screenshot({ path: path.join(outputDir, `${viewport.name}-expiry-journey.png`), fullPage: true });
    await page.getByRole("button", { name: "Backtest history" }).click();
    await page.getByRole("heading", { name: "High, Medium and Low cohort outcomes" }).waitFor();
    check(`${viewport.name} backtest evidence tables`, payload.backtestHistory?.bandSummary?.length === 16 && payload.backtestHistory?.conditionEvidence?.length === 40 && payload.backtestHistory?.correlations?.length === 50 && payload.backtestHistory?.monthlySummary?.length === 118, JSON.stringify({ bands: payload.backtestHistory?.bandSummary?.length, conditions: payload.backtestHistory?.conditionEvidence?.length, correlations: payload.backtestHistory?.correlations?.length, monthly: payload.backtestHistory?.monthlySummary?.length }));
    check(`${viewport.name} month-year stability`, await page.getByRole("heading", { name: "High and Medium monthly cohorts" }).count() === 1, "month-year history missing");
    check(`${viewport.name} quarantined historical evidence`, await page.getByText("Historical quality evidence is quarantined", { exact: true }).count() === 1 && payload.backtestHistory?.governance?.status === "BLOCKED_DATA_QUALITY_REBUILD", JSON.stringify(payload.backtestHistory?.governance));
    const qualityBandCounts = await Promise.all(["High", "Medium", "Low"].map((band) => page.getByText(band, { exact: true }).count()));
    check(`${viewport.name} all quality bands`, qualityBandCounts.every((count) => count > 0), `counts=${qualityBandCounts.join(",")}`);
    check(`${viewport.name} success and failure counts`, await page.getByText("successful", { exact: true }).count() >= 6 && await page.getByText("failed", { exact: true }).count() >= 6, "outcome counts missing");
    check(`${viewport.name} condition evidence`, await page.getByRole("heading", { name: "Pass versus fail uplift" }).count() === 1, "condition evidence missing");
    check(`${viewport.name} correlation evidence`, await page.getByRole("heading", { name: "Good-versus-bad descriptive relationships" }).count() === 1, "correlation evidence missing");
    check(`${viewport.name} no body overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `scrollWidth=${await page.evaluate(() => document.documentElement.scrollWidth)}`);
    check(`${viewport.name} console`, errors.length === 0, errors.join(" | "));
    await page.screenshot({ path: path.join(outputDir, `${viewport.name}.png`), fullPage: true });
    await context.close();
  }
} finally {
  await browser.close();
  await fs.writeFile(path.join(outputDir, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
}

console.log(JSON.stringify({ checks: results.length, passed: results.filter((row) => row.passed).length, outputDir }, null, 2));
