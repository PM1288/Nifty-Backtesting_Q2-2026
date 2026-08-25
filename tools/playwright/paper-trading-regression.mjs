import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const origin = (process.env.PLAYWRIGHT_ORIGIN ?? "http://127.0.0.1:19090").replace(/\/$/, "");
const appBase = `${origin}/n50`;
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
const outputDir = path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR ?? "output/playwright/paper-trading-command-center");
const prototypePath = process.env.PAPER_PROTOTYPE_PATH ?? "/home/novius2/NIFTY50/Paper-Trade-UI/NIFTY50_Paper_Trading_Command_Center_Uplift.html";
if (!password) throw new Error("PLAYWRIGHT_ADMIN_PASSWORD is required.");

await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
function check(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}: ${detail}`);
}

try {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const login = await context.request.post(`${origin}/auth/session/dev-login`, { data: { identifier: "admin", password } });
  check("admin login", login.ok(), `status=${login.status()}`);
  const page = await context.newPage();
  const consoleErrors = [];
  const blockedThirdPartyScripts = [];
  const browserNetworkTransitions = [];
  const pageErrors = [];
  const failedAppResponses = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    if (/(static\.cloudflareinsights\.com|[a-z]\.clarity\.ms|firebasedatabase\.app).*Content Security Policy/i.test(message.text())) {
      blockedThirdPartyScripts.push(message.text());
      return;
    }
    if (/Failed to load resource: net::ERR_NETWORK_CHANGED/i.test(message.text())) {
      browserNetworkTransitions.push(message.text());
      return;
    }
    consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  page.on("response", (response) => {
    if (response.status() >= 400 && /\/n50\/(v1|auth)\//.test(response.url())) failedAppResponses.push(`${response.status()} ${response.url()}`);
  });

  const response = await page.goto(`${appBase}/paper-trading?prefetch=off`, { waitUntil: "networkidle", timeout: 60_000 });
  check("route response", Boolean(response?.ok()), `status=${response?.status()}`);
  await page.getByRole("heading", { name: "Paper Trading", exact: true }).waitFor();
  check("paper identity", await page.getByText("PAPER PORTFOLIO · EXECUTION AND OBSERVATION", { exact: true }).count() === 1, "PAPER portfolio identity missing");
  check("maturity evidence", await page.getByText("EVIDENCE MATURITY", { exact: true }).count() === 1, "maturity banner missing");
  check("no numeric quality dial", await page.getByText("QUALITY", { exact: true }).count() === 0, "immature quality dial remains visible");
  check("actual and analytical separated", (await page.locator("#trades caption").innerText()).includes("remain separate"), "execution/observation separation is unclear");
  check("scenario collapsed", await page.locator("details").filter({ hasText: "Scenario analysis" }).evaluate((node) => !node.open), "scenario analysis should be collapsed");
  check("weekly widget removed", await page.getByRole("heading", { name: "Paper gross mark versus NIFTY 50" }).count() === 0, "weekly widget is still visible");
  check("four summary metrics", await page.locator('article').filter({ has: page.locator(':scope > span') }).filter({ hasText: /Booked realised net|Open unrealised gross|Observed favourable value|Observed adverse value/ }).count() >= 4, "four executive metrics are incomplete");
  const body = await page.locator("body").innerText();
  for (const target of ["+0.3%", "+0.5%", "+1%"] ) {
    check(`target ${target}`, body.includes(target), `${target} not rendered`);
  }
  check("open and closed observations", body.includes("LTM") && body.includes("PFC"), "expected open LTM and closed PFC analytical rows");
  check("matrix has real rows", await page.locator("tbody tr").count() >= 2, "paper matrix is empty");
  check("entry date newest is default", await page.getByLabel("Sort paper trades").inputValue() === "NEWEST", "paper table did not default to newest entry first");
  const paperPayload = await page.evaluate(async () => {
    const response = await fetch("/n50/v1/workspace/paper-trading", { credentials: "include" });
    return { status: response.status, payload: await response.json() };
  });
  check("paper API target audit", paperPayload.status === 200, `status=${paperPayload.status}`);
  const newestApiTrade = [...paperPayload.payload.stockTrades].sort((left, right) => new Date(right.opened_at).getTime() - new Date(left.opened_at).getTime())[0];
  const firstMatrixSymbol = await page.locator("#trades tbody tr").first().locator("td").first().innerText();
  check("latest entry is first row", firstMatrixSymbol.includes(newestApiTrade.symbol), `first=${firstMatrixSymbol} expected=${newestApiTrade.symbol}`);
  for (const trade of paperPayload.payload.stockTrades) {
    const intraday = (trade.targets ?? []).filter((target) => target.lifecycle === "INTRADAY");
    check(`${trade.symbol} has complete intraday ladder`, [0.003, 0.004, 0.005, 0.01].every((value) => intraday.some((target) => Math.abs(Number(target.target_pct) - value) < 1e-9)), JSON.stringify(intraday));
    const pointFour = intraday.find((target) => Math.abs(Number(target.target_pct) - 0.004) < 1e-9);
    const pointFive = intraday.find((target) => Math.abs(Number(target.target_pct) - 0.005) < 1e-9);
    if (["HIT", "CLOSED_AT_TARGET"].includes(String(pointFive?.status))) {
      check(`${trade.symbol} monotonic 0.4 target`, ["HIT", "CLOSED_AT_TARGET"].includes(String(pointFour?.status)), `0.4=${pointFour?.status} 0.5=${pointFive?.status}`);
    }
  }
  const unifiedHeaders = await page.locator("#trades thead").innerText();
  for (const heading of ["TRADE", "ACTUAL ECONOMICS", "D0 15:30 P/L", "INTRADAY", "SWING", "5D", "30D", "TIME SINCE ENTRY", "MAXIMUM PROFIT", "MAXIMUM DRAWDOWN", "NEVER-CLOSED CARRY", "QUALITY", "ADMIN COMMENTS"]) check(`unified column ${heading}`, unifiedHeaders.includes(heading), `${heading} missing`);
  check("no matrix tabs", await page.getByLabel("Paper trade table view").count() === 0, "old matrix tabs remain");
  check("desktop overflow", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), "document overflows horizontally");
  const desktopTypography = await page.evaluate(() => {
    const root = document.querySelector("h1")?.closest("main") ?? document.querySelector("main") ?? document.body;
    const visible = [...(root?.querySelectorAll("*") ?? [])].filter((element) => {
      const style = getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0 && element.textContent?.trim();
    });
    const sizes = visible.map((element) => Number.parseFloat(getComputedStyle(element).fontSize)).filter(Number.isFinite);
    return { count: sizes.length, minimum: sizes.length ? Math.min(...sizes) : null, belowEight: sizes.filter((size) => size < 8).length, belowTen: sizes.filter((size) => size < 10).length };
  });
  check("paper typography floor", desktopTypography.count > 0 && desktopTypography.minimum >= 8 && desktopTypography.belowEight === 0, JSON.stringify(desktopTypography));

  await page.keyboard.press("/");
  const matrixSearch = page.locator('input[placeholder="Symbol or strategy · /"]');
  check("keyboard search", await matrixSearch.evaluate((element) => element === document.activeElement), "/ did not focus page search");
  await matrixSearch.fill("LTM");
  check("search filter", await page.locator("#trades tbody tr").count() === 1, "search did not reduce the matrix to one row");
  await page.locator("#trades tbody tr").first().click();
  const tradeDrawer = page.locator('aside[aria-label$=" paper trade detail"]');
  await tradeDrawer.waitFor();
  const durableComment = "Admin regression note — comment persistence verified.";
  await page.getByRole("button", { name: "Comments", exact: true }).click();
  check("admin comment privacy label", await tradeDrawer.getByText("Private operational notes. Visible only to administrators.", { exact: true }).count() === 1, "privacy label missing");
  if (await tradeDrawer.getByText(durableComment, { exact: true }).count() === 0) {
    await tradeDrawer.getByLabel("Add comment").fill(durableComment);
    await tradeDrawer.getByRole("button", { name: "Save comment", exact: true }).click();
    await tradeDrawer.getByText(durableComment, { exact: true }).waitFor();
  }
  check("admin comment stored", await tradeDrawer.getByText(durableComment, { exact: true }).count() === 1, "saved comment not shown");
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Paper Trading", exact: true }).waitFor();
  await matrixSearch.fill("LTM");
  await page.locator("#trades tbody tr").first().click();
  await tradeDrawer.waitFor();
  await page.getByRole("button", { name: "Comments", exact: true }).click();
  check("admin comment survives reload", await tradeDrawer.getByText(durableComment, { exact: true }).count() === 1, "comment did not persist across reload");
  await page.screenshot({ path: path.join(outputDir, "paper-admin-comments-1920x1080.png") });
  await page.getByRole("button", { name: "Targets", exact: true }).click();
  const intradayTargets = tradeDrawer.locator("article").filter({ hasText: "INTRADAY" });
  check("LTM has four intraday targets", await intradayTargets.count() === 4, `count=${await intradayTargets.count()}`);
  for (let index = 0; index < await intradayTargets.count(); index += 1) {
    const state = await intradayTargets.nth(index).locator("strong[data-state]").innerText();
    check(`LTM intraday target ${index + 1} finalised`, state === "FAILED", `state=${state}`);
  }
  const swingTargets = tradeDrawer.locator("article").filter({ hasText: "SWING" });
  check("LTM has three swing targets", await swingTargets.count() === 3, `count=${await swingTargets.count()}`);
  for (let index = 0; index < await swingTargets.count(); index += 1) {
    const state = await swingTargets.nth(index).locator("strong[data-state]").innerText();
    check(`LTM swing target ${index + 1} remains open`, state === "PENDING", `state=${state}`);
  }
  for (const tab of ["Journey", "Targets", "Evidence", "Comments", "Audit"]) {
    await page.getByRole("button", { name: tab, exact: true }).click();
    check(`drawer ${tab}`, await page.getByRole("button", { name: tab, exact: true }).getAttribute("data-active") === "true", `${tab} did not activate`);
  }
  await page.keyboard.press("Escape");
  await tradeDrawer.waitFor({ state: "detached", timeout: 5_000 });
  check("drawer escape", await tradeDrawer.count() === 0, "Escape did not close drawer");
  await matrixSearch.fill("PFC");
  check("hit-target trade filter", await page.locator("#trades tbody tr").count() === 1, "PFC trade is unavailable");
  await page.locator("#trades tbody tr").first().click();
  await tradeDrawer.waitFor();
  await page.getByRole("button", { name: "Targets", exact: true }).click();
  const hitDrawerText = await tradeDrawer.innerText();
  check("drawer target profit per share", hitDrawerText.includes("Profit per share"), "drawer target profit/share is missing");
  check("drawer target profit quantity", hitDrawerText.includes("Profit ×"), "drawer quantity-adjusted target profit is missing");
  await page.keyboard.press("Escape");
  await tradeDrawer.waitFor({ state: "detached", timeout: 5_000 });
  check("hit-target drawer escape", await tradeDrawer.count() === 0, "Escape did not close PFC drawer");
  await matrixSearch.fill("");
  await page.getByRole("button", { name: "Calm motion" }).click();
  check("calm mode", await page.getByRole("button", { name: "Motion paused" }).count() === 1, "calm mode did not activate");

  await page.screenshot({ path: path.join(outputDir, "paper-command-center-1920x1080.png") });
  await page.screenshot({ path: path.join(outputDir, "paper-command-center-full.png"), fullPage: true });
  check("console clean", consoleErrors.length === 0, consoleErrors.join(" | "));
  check("known analytics beacons isolated", blockedThirdPartyScripts.length <= 10, `blocked=${blockedThirdPartyScripts.length}`);
  check("browser network transitions bounded", browserNetworkTransitions.length <= 10, `transitions=${browserNetworkTransitions.length}`);
  check("page errors clean", pageErrors.length === 0, pageErrors.join(" | "));
  check("application responses clean", failedAppResponses.length === 0, failedAppResponses.join(" | "));

  const responsive = await context.newPage();
  await responsive.setViewportSize({ width: 768, height: 1024 });
  await responsive.goto(`${appBase}/paper-trading?prefetch=off`, { waitUntil: "networkidle", timeout: 60_000 });
  await responsive.getByRole("heading", { name: "Paper Trading", exact: true }).waitFor();
  check("responsive overflow", await responsive.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), "768px document overflows");
  await responsive.screenshot({ path: path.join(outputDir, "paper-command-center-768x1024.png"), fullPage: true });

  const laptop = await context.newPage();
  await laptop.setViewportSize({ width: 1366, height: 768 });
  await laptop.goto(`${appBase}/paper-trading?prefetch=off`, { waitUntil: "networkidle", timeout: 60_000 });
  await laptop.getByRole("heading", { name: "Paper Trading", exact: true }).waitFor();
  check("laptop overflow", await laptop.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), "1366px document overflows");
  await laptop.screenshot({ path: path.join(outputDir, "paper-command-center-1366x768.png"), fullPage: true });

  const mobile = await context.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto(`${appBase}/paper-trading?prefetch=off`, { waitUntil: "networkidle", timeout: 60_000 });
  await mobile.getByRole("heading", { name: "Paper Trading", exact: true }).waitFor();
  check("mobile trade cards", await mobile.locator("#trades button").filter({ hasText: "Open complete trade evidence" }).count() >= 2, "mobile trade cards missing");
  check("mobile desktop table hidden", await mobile.locator("#trades table").evaluate((node) => getComputedStyle(node.closest('div')).display === "none"), "desktop matrix remains visible on mobile");
  check("mobile overflow", await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), "390px document overflows");
  const mobileTypography = await mobile.evaluate(() => {
    const root = document.querySelector("h1")?.closest("main") ?? document.querySelector("main") ?? document.body;
    const sizes = [...root.querySelectorAll("*")]
      .filter((element) => getComputedStyle(element).display !== "none" && element.getClientRects().length > 0 && element.textContent?.trim())
      .map((element) => Number.parseFloat(getComputedStyle(element).fontSize)).filter(Number.isFinite);
    return { count: sizes.length, minimum: sizes.length ? Math.min(...sizes) : null };
  });
  check("mobile typography floor", mobileTypography.count > 0 && mobileTypography.minimum >= 8, JSON.stringify(mobileTypography));
  await mobile.screenshot({ path: path.join(outputDir, "paper-command-center-390x844.png"), fullPage: true });

  const compactMobile = await context.newPage();
  await compactMobile.setViewportSize({ width: 360, height: 800 });
  await compactMobile.goto(`${appBase}/paper-trading?prefetch=off`, { waitUntil: "networkidle", timeout: 60_000 });
  await compactMobile.getByRole("heading", { name: "Paper Trading", exact: true }).waitFor();
  check("compact mobile overflow", await compactMobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), "360px document overflows");
  await compactMobile.screenshot({ path: path.join(outputDir, "paper-command-center-360x800.png"), fullPage: true });

  const prototype = await context.newPage();
  await prototype.goto(`file://${prototypePath}`, { waitUntil: "load" });
  check("standalone dummy rows", await prototype.locator("tbody tr").count() === 6, "standalone prototype must contain six deterministic dummy trades");
  await prototype.locator("tbody tr").first().click();
  check("standalone drawer", await prototype.locator("#drawerbg.open").count() === 1, "standalone trade detail did not open");
  await prototype.screenshot({ path: path.join(outputDir, "paper-command-center-standalone.png"), fullPage: true });
  await context.close();
} finally {
  await browser.close();
  await fs.writeFile(path.join(outputDir, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
}

console.log(JSON.stringify({ checks: results.length, passed: results.filter((item) => item.passed).length, outputDir }, null, 2));
