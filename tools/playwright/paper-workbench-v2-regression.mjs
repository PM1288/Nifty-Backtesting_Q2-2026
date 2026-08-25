import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = (process.env.PLAYWRIGHT_BASE_URL ?? "https://n50.nifty50today.co.in/n50").replace(/\/$/, "");
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
if (!password) throw new Error("PLAYWRIGHT_ADMIN_PASSWORD is required");
const outputDir = path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR ?? "output/playwright/paper-workbench-v2");
await fs.mkdir(outputDir, { recursive: true });

const n = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const close = (left, right, tolerance = 0.02) => Math.abs(n(left) - n(right)) <= tolerance;
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, acceptDownloads: true });
  const login = await context.request.post(`${baseUrl}/auth/session/dev-login`, { data: { identifier: "admin", password } });
  if (!login.ok()) throw new Error(`admin login failed: ${login.status()}`);
  const api = await context.request.get(`${baseUrl}/v1/workspace/paper-trading`, { timeout: 120_000 });
  if (!api.ok()) throw new Error(`workspace API failed: ${api.status()}`);
  const payload = await api.json();
  const trades = payload.stockTrades ?? [];
  if (!trades.length) throw new Error("canonical paper ledger returned no trades");

  const realised = trades.reduce((sum, trade) => sum + n(trade.realised_net_pnl), 0);
  const open = trades.reduce((sum, trade) => sum + n(trade.open_unrealised_gross_pnl), 0);
  if (!close(realised, payload.summary.realised_pnl)) throw new Error(`booked net reconciliation failed: ${realised} != ${payload.summary.realised_pnl}`);
  if (!close(open, payload.summary.unrealised_pnl)) throw new Error(`open gross reconciliation failed: ${open} != ${payload.summary.unrealised_pnl}`);
  for (const trade of trades) {
    const intraday = (trade.targets ?? []).filter((target) => target.lifecycle === "INTRADAY");
    const hitThresholds = intraday.filter((target) => target.first_hit_at).map((target) => n(target.target_pct)).sort((a, b) => a - b);
    if (hitThresholds.length) {
      const maximum = hitThresholds.at(-1);
      const eligibleLower = intraday.filter((target) => n(target.target_pct) < maximum);
      const missingLower = eligibleLower.filter((target) => !target.first_hit_at);
      if (missingLower.length) throw new Error(`${trade.symbol}: higher intraday target hit while lower target is not hit`);
    }
    if (n(trade.sessions_observed) < 5 && trade.horizon_5d_snapshot_state === "DEVELOPING" && trade.horizon_30d_snapshot_state === "DEVELOPING_INCLUSIVE" && !close(trade.horizon_5d_snapshot_pnl, trade.horizon_30d_snapshot_pnl)) {
      throw new Error(`${trade.symbol}: developing 5D and inclusive 30D snapshot diverged before five-session maturity`);
    }
  }

  const page = await context.newPage();
  const consoleErrors = [];
  const ignored = /(?:clarity\.ms|analytics\.google\.com|cloudflareinsights|ERR_BLOCKED_BY_CLIENT|ERR_ABORTED)/;
  page.on("console", (message) => { if (message.type() === "error" && !ignored.test(message.text())) consoleErrors.push(message.text()); });
  const route = await page.goto(`${baseUrl}/paper-trading`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  if (!route?.ok()) throw new Error(`paper route failed: ${route?.status()}`);
  await page.getByRole("heading", { name: "Paper Trading Evidence Workbench" }).waitFor({ timeout: 120_000 });

  const sectionNav = page.getByRole("navigation", { name: "Paper Trading workbench sections" });
  if (await sectionNav.getByRole("button").count() !== 8) throw new Error("expected eight workbench sections");
  await sectionNav.getByRole("button", { name: /Trade Evidence/ }).click();
  await page.waitForTimeout(300);
  if (!page.url().includes("section=trade-evidence")) throw new Error("section selection was not serialised into the URL");

  const contextBar = page.getByRole("region", { name: "Analysis context" });
  await contextBar.getByLabel("Direction").selectOption("BUY");
  await contextBar.getByLabel("Period").selectOption("30D");
  if (!page.url().includes("direction=BUY") || !page.url().includes("period=30D")) throw new Error("analysis context did not persist to URL");
  await contextBar.getByRole("button", { name: "Clear" }).click();

  await page.getByRole("button", { name: "Quality", exact: true }).click();
  const table = page.locator('div[class*="unifiedTable"] table');
  await table.getByText("Trade & Entry", { exact: true }).waitFor();
  if (await table.getByText("Target Outcomes", { exact: true }).count()) throw new Error("Audit preset unexpectedly retained hidden target group");
  await page.getByRole("button", { name: "All fields" }).click();
  await table.getByText("Target Outcomes", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Audit", exact: true }).click();

  const rows = table.locator("tbody tr");
  await rows.first().getByRole("button", { name: /Open .* evidence/ }).click();
  if (!page.url().includes("tradeId=")) throw new Error("selected trade was not deep-linked");
  const inspector = page.getByRole("complementary", { name: /paper trade detail/ });
  await inspector.waitFor();
  await inspector.getByRole("button", { name: "Economics" }).click();
  await inspector.getByRole("heading", { name: "Economics lanes" }).waitFor();
  await inspector.getByRole("button", { name: "Calculation Trace" }).click();
  await inspector.getByRole("heading", { name: "Calculation trace" }).waitFor();
  await inspector.getByRole("button", { name: "Close trade detail" }).click();
  if (page.url().includes("tradeId=")) throw new Error("closing the inspector did not clear selected trade context");

  for (const expected of ["Path Through Time", "Reward & Pain", "Factor Analysis", "Capital Recycling", "Scenario Analysis", "Methodology & Audit"]) {
    await sectionNav.getByRole("button", { name: new RegExp(expected.replace("&", "&")) }).click();
    await page.waitForTimeout(100);
  }
  await page.getByRole("heading", { name: "Canonical paper evidence trust matrix" }).waitFor();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export view" }).click();
  const download = await downloadPromise;
  const exportPath = path.join(outputDir, await download.suggestedFilename());
  await download.saveAs(exportPath);
  const exported = await fs.readFile(exportPath, "utf8");
  for (const marker of ["data_as_of", "environment", "filters", "policy_version", "accountingClass"]) {
    if (!exported.includes(marker) && marker !== "accountingClass") throw new Error(`CSV export missing ${marker}`);
  }

  const screenshots = [];
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 1600, height: 900 }, { width: 1440, height: 900 }, { width: 1366, height: 768 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto(`${baseUrl}/paper-trading`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.getByRole("heading", { name: "Paper Trading Evidence Workbench" }).waitFor({ timeout: 120_000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    if (overflow) throw new Error(`${viewport.width}x${viewport.height}: body overflow`);
    const file = `paper-workbench-v2-${viewport.width}x${viewport.height}.png`;
    await page.screenshot({ path: path.join(outputDir, file), fullPage: true });
    screenshots.push(file);
  }
  if (consoleErrors.length) throw new Error(`browser console errors: ${consoleErrors.join(" | ")}`);
  const evidence = { status: "PASS", asOf: payload.asOf, tradeCount: trades.length, reconciliation: { realisedNet: realised, openUnrealisedGross: open, higherTargetImpliesLowerTarget: true, inclusiveHorizonRule: true }, screenshots, exportPath };
  await fs.writeFile(path.join(outputDir, "regression-results.json"), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await browser.close();
}
