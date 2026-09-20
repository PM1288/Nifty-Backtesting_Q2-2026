import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const appOrigin = process.env.SCALPER_V2_APP_ORIGIN ?? "http://127.0.0.1:15190";
const authOrigin = process.env.SCALPER_V2_AUTH_ORIGIN ?? "http://127.0.0.1:19090";
const authRequestOrigin = process.env.SCALPER_V2_AUTH_REQUEST_ORIGIN ?? authOrigin;
const output = path.resolve(process.env.SCALPER_V2_OUTPUT ?? "/tmp/scalper-v2-popout-structure-20260919");
const testDay = process.env.SCALPER_V2_TEST_DAY ?? "";
const testAsOf = process.env.SCALPER_V2_TEST_AS_OF ?? "";
const injectOiHistory = process.env.SCALPER_V2_INJECT_OI_HISTORY === "1";
const envText = await fs.readFile(process.env.PLAYWRIGHT_ENV_FILE ?? ".env", "utf8");
const rawPassword = process.env.PLAYWRIGHT_ADMIN_PASSWORD ?? envText.split(/\r?\n/).find((line) => line.startsWith("DEV_LOCAL_AUTH_PASSWORD="))?.split("=").slice(1).join("=").trim();
const password = rawPassword?.replace(/^"|"$/g, "");
if (!password) throw new Error("Protected browser-test password is unavailable");
await fs.mkdir(output, { recursive: true });

const results = [];
const check = (name, pass, detail) => results.push({ name, status: pass ? "PASS" : "FAIL", detail });
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: "reduce" });
  const login = await context.request.post(`${authOrigin}/n50/auth/session/dev-login`, { data: { identifier: "admin", password }, headers: { Origin: authRequestOrigin } });
  check("authenticated", login.ok(), `HTTP ${login.status()}`);
  const session = (await context.storageState()).cookies.find((cookie) => cookie.name.includes("session"));
  if (session) {
    const target = new URL(appOrigin);
    await context.clearCookies();
    await context.addCookies([{ ...session, domain: target.hostname, path: "/", secure: target.protocol === "https:", sameSite: "Lax" }]);
  }

  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.stack ?? String(error)));
  if (injectOiHistory) await page.route("**/v1/trading-analytics/charts?**", async (route) => {
    const response = await route.fetch();
    const payload = await response.json();
    const bars = payload?.panes?.find((pane) => String(pane?.identity?.type ?? "").toUpperCase() === "UNDERLYING")?.bars ?? payload?.panes?.[0]?.bars ?? [];
    const samples = bars.filter((bar) => bar?.closed === true && bar?.end).slice(-3);
    payload.cumulativeOiHistory = {
      scope: "PLAYWRIGHT_SYNTHETIC_TRACKED_COHORT",
      points: samples.map((bar, index) => ({
        snapshotId: `browser-fixture-${index}`,
        capturedAt: bar.end,
        source: { fixture: true },
        strikesAround: 10,
        strikeCount: 20,
        ceContractCount: 10,
        ceObservedCount: 10,
        ceOi: 1_000_000 + index * 20_000,
        peContractCount: 10,
        peObservedCount: 10,
        peOi: 1_100_000 + index * 35_000,
        ceChangeObservedCount: 10,
        ceChangeOi: 20_000 + index * 2_000,
        peChangeObservedCount: 10,
        peChangeOi: 35_000 + index * 4_000,
        oiDifference: 100_000 + index * 15_000,
        changeOiDifference: 15_000 + index * 2_000,
        pcr: (1_100_000 + index * 35_000) / (1_000_000 + index * 20_000),
        state: "COMPLETE",
        changeState: "COMPLETE",
      })),
    };
    await route.fulfill({ response, json: payload });
  });
  const dayQuery = testDay ? `&day=${encodeURIComponent(testDay)}` : "";
  const asOfQuery = testAsOf ? `&asOf=${encodeURIComponent(testAsOf)}` : "";
  await page.goto(`${appOrigin}/n50/strategy/trading-analytics?view=scalper_v2&interval=5${dayQuery}${asOfQuery}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.getByTestId("scalper-v2").waitFor({ state: "visible", timeout: 90_000 }).catch(async (error) => {
    console.log(JSON.stringify({ loginStatus: login.status(), cookieNames: (await context.cookies()).map((cookie) => cookie.name), url: page.url(), errors, body: (await page.locator("body").innerText()).slice(0, 2_500) }));
    throw error;
  });
  await page.waitForTimeout(2_000);

  const layout = await page.evaluate(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    };
    return {
      stage: rect("[data-testid='v2-chart-panel-underlying']")?.x == null ? null : rect("[data-testid='v2-chart-panel-underlying']"),
      callPanel: rect("[data-testid='v2-chart-panel-call']"),
      priceGrid: (() => {
        const element = document.querySelector("[data-testid='v2-chart-panel-underlying']")?.parentElement;
        if (!element) return null;
        const box = element.getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width, height: box.height };
      })(),
      oiHistory: rect("[data-testid='v2-oi-history-row']"),
      sideOi: rect("[data-testid='v2-strike-side-charts']"),
      details: rect("aside[aria-label='Scalper V2 option chain and inspector']"),
      gauge: rect("[data-testid='v2-underlying-level-gauge']"),
    };
  });
  check("side-oi-column-restored", await page.getByTestId("v2-strike-side-charts").count() === 1, JSON.stringify(layout.sideOi));
  check("side-oi-column-bounded", Boolean(layout.sideOi && layout.priceGrid && layout.sideOi.width >= 298 && layout.sideOi.width <= 362 && Math.abs(layout.sideOi.height - layout.priceGrid.height) <= 2), JSON.stringify({ priceGrid: layout.priceGrid, sideOi: layout.sideOi }));
  check("side-oi-three-panels", await page.getByTestId("v2-strike-side-charts").locator(":scope > article").count() === 3, "OI, strike structure and positioning heatmap remain separate side charts");
  const structurePanel = page.getByTestId("v2-side-strike-structure-chart");
  if (await structurePanel.count() === 0) console.log(JSON.stringify({ debugTestIds: await page.locator("[data-testid]").evaluateAll((elements) => elements.map((element) => element.getAttribute("data-testid")).filter(Boolean)), pageErrors: errors, debugText: (await page.locator("body").innerText()).slice(0, 2_500) }));
  await structurePanel.waitFor({ state: "visible", timeout: 90_000 });
  const structurePanelText = await structurePanel.innerText();
  check("strike-structure-chart", /Strike structure/.test(structurePanelText) && (/unavailable/i.test(structurePanelText) || await structurePanel.getByRole("img").count() === 1), structurePanelText);
  const heatmapPanel = page.getByTestId("v2-side-positioning-heatmap");
  const heatmapPanelText = await heatmapPanel.innerText();
  check("positioning-heatmap", /Strike × time positioning/.test(heatmapPanelText) && (/unavailable/i.test(heatmapPanelText) || await heatmapPanel.getByRole("img").count() === 1), heatmapPanelText);
  const spreadPanel = page.getByTestId("v2-spread-strike-chart");
  check("spread-uses-empty-corner", await spreadPanel.count() === 1 && /Bid–ask spread by strike/.test(await spreadPanel.innerText()), await spreadPanel.innerText());
  check("three-price-chart-grid", await page.locator("[data-testid^='v2-chart-panel-']").count() === 3, "Underlying plus exact CE and PE only");
  check("bounded-price-grid-height", Boolean(layout.priceGrid && layout.priceGrid.height >= 620 && layout.priceGrid.height <= 645), JSON.stringify(layout.priceGrid));
  const historyGeometry = await page.getByTestId("v2-oi-history-row").evaluate((element) => [...element.querySelectorAll(":scope > div > article")].map((article) => {
    const chart = article.querySelector('[role="img"]');
    const outer = article.getBoundingClientRect();
    const inner = chart?.getBoundingClientRect();
    return { outerWidth: outer.width, chartWidth: inner?.width ?? 0, outerHeight: outer.height, chartHeight: inner?.height ?? 0 };
  }));
  check("oi-history-matches-price-columns", historyGeometry.length === 2 && layout.stage && layout.callPanel && Math.abs(historyGeometry[0].outerWidth - layout.stage.width) <= 3 && Math.abs(historyGeometry[1].outerWidth - layout.callPanel.width) <= 3, JSON.stringify({ historyGeometry, underlying: layout.stage, call: layout.callPanel }));
  check("aligned-auxiliary-chart-height", historyGeometry.every((item) => item.outerHeight >= 205 && item.outerHeight <= 215), JSON.stringify(historyGeometry));
  const spreadGeometry = await spreadPanel.evaluate((element) => { const box = element.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height }; });
  check("spread-corner-aligned", Boolean(layout.sideOi && spreadGeometry.width >= layout.sideOi.width - 2 && spreadGeometry.height >= 205 && spreadGeometry.height <= 215), JSON.stringify({ sideOi: layout.sideOi, spreadGeometry }));
  check("oi-history-directly-below-price-grid", Boolean(layout.oiHistory && layout.priceGrid && Math.abs(layout.oiHistory.y - (layout.priceGrid.y + layout.priceGrid.height + 3)) <= 2), JSON.stringify(layout));
  const historyText = await page.getByTestId("v2-oi-history-row").innerText();
  check("separate-oi-difference-semantics", historyText.includes("Cumulative PE OI − cumulative CE OI") && historyText.includes("Cumulative PE ΔOI − cumulative CE ΔOI"), historyText);
  await page.screenshot({ path: path.join(output, "scalper-v2-price-and-oi-history-1920x1080.png"), fullPage: false });
  check("details-moved-below-price-grid", Boolean(layout.details && layout.priceGrid && layout.details.y >= layout.priceGrid.y + layout.priceGrid.height - 2), JSON.stringify(layout));
  check("top-current-values", (await page.locator("[aria-label='Current selected values'] span").count()) === 3, "underlying, CE and PE values shown in the command bar");
  check("symbol-first", (await page.locator("[data-testid='scalper-v2'] > header").innerText()).trim().startsWith("NIFTY"), await page.locator("[data-testid='scalper-v2'] > header").innerText());
  for (const label of ["1m", "5m", "15m", "1h"]) {
    check(`timeframe-${label}-available`, await page.getByRole("button", { name: label, exact: true }).count() === 1, `${label} timeframe control is available once`);
  }
  check("active-timeframe-visible", await page.getByRole("button", { name: "5m", exact: true }).getAttribute("aria-current") === "page", "The URL-selected 5m timeframe is visibly active");
  await page.getByRole("button", { name: "15m", exact: true }).click();
  await page.waitForURL((url) => url.searchParams.get("interval") === "15", { timeout: 10_000 });
  check("timeframe-switch-updates-url", await page.getByRole("button", { name: "15m", exact: true }).getAttribute("aria-current") === "page", page.url());
  await page.waitForFunction(() => [...document.querySelectorAll("[data-testid^='v2-chart-body-']")].every((element) => element.dataset.volumeEmaPeriod === "5" && Number(element.dataset.volumeEmaPoints ?? 0) > 0), undefined, { timeout: 30_000 });
  check("fifteen-minute-volume-ema5", await page.locator("[data-testid^='v2-chart-body-']").evaluateAll((elements) => elements.length === 3 && elements.every((element) => element.dataset.volumeEmaPeriod === "5" && Number(element.dataset.volumeEmaPoints ?? 0) > 0)), "Underlying, CE and PE use volume EMA5 at 15m");
  await page.getByRole("button", { name: "5m", exact: true }).click();
  await page.waitForURL((url) => url.searchParams.get("interval") === "5", { timeout: 10_000 });
  const analyticsHeader = page.locator("section[aria-label='Trading Analytics workspace'] > header").first();
  const analyticsHeaderText = await analyticsHeader.innerText();
  check("scalper-parent-labels-hidden", !/Trading Analytics · Scalper V2|NIFTY strategy|Health|Formula|Conditions/.test(analyticsHeaderText), analyticsHeaderText);
  const headerGeometry = await page.evaluate(() => {
    const parent = document.querySelector("section[aria-label='Trading Analytics workspace'] > header")?.getBoundingClientRect();
    const command = document.querySelector("[data-testid='scalper-v2'] > header")?.getBoundingClientRect();
    return { parentHeight: parent?.height ?? 0, commandHeight: command?.height ?? 0 };
  });
  check("two-compact-header-rows", headerGeometry.parentHeight <= 36 && headerGeometry.commandHeight <= 36, JSON.stringify(headerGeometry));
  check("header-pcr-values", await page.getByText("OI PCR", { exact: false }).count() >= 1 && await page.getByText("Volume PCR", { exact: false }).count() >= 1, "OI PCR and Volume PCR are retained in the top header");
  const popoutStyle = await page.getByTestId("v2-popout").evaluate((element) => ({ color: getComputedStyle(element).color, background: getComputedStyle(element).backgroundColor, right: element.getBoundingClientRect().right, barRight: element.parentElement?.getBoundingClientRect().right }));
  check("popout-red-rightmost", popoutStyle.background === "rgb(198, 40, 61)" && popoutStyle.barRight != null && Math.abs(popoutStyle.barRight - popoutStyle.right) <= 6, JSON.stringify(popoutStyle));

  const underlying = page.getByTestId("v2-chart-host-underlying");
  const box = await underlying.boundingBox();
  if (box) await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.45);
  await page.waitForTimeout(180);
  const cursor = await page.evaluate(() => ["underlying", "call", "put"].map((id) => ({
    id,
    time: document.querySelector(`[data-testid="v2-chart-host-${id}"]`)?.dataset.crosshairTime ?? "",
    exact: document.querySelector(`[data-testid="v2-chart-host-${id}"]`)?.dataset.crosshairExact ?? "source",
  })));
  check("uniform-time-cursor", cursor[0].time !== "" && cursor.every((item) => item.time === cursor[0].time), JSON.stringify(cursor));
  const activeStrikeIndexes = await page.locator("[data-testid='v2-strike-side-charts'] > article:nth-child(-n+2) [role='img']").evaluateAll((elements) => elements.map((element) => element.dataset.activeCategoryIndex));
  check("time-cursor-to-strike-charts", activeStrikeIndexes.length === 2 && activeStrikeIndexes.every((value) => value !== ""), JSON.stringify(activeStrikeIndexes));
  const heatmapActiveTime = await page.getByTestId("v2-side-positioning-heatmap").getByRole("img").getAttribute("data-active-time-ms");
  check("time-cursor-to-positioning-heatmap", Boolean(heatmapActiveTime), String(heatmapActiveTime ?? ""));
  const pricePaneVolumes = await page.locator("[data-testid^='v2-chart-body-']").evaluateAll((elements) => elements.map((element) => ({
    id: element.getAttribute("data-testid"), label: element.dataset.volumeLabel ?? "", points: Number(element.dataset.volumePoints ?? 0),
    emaPeriod: Number(element.dataset.volumeEmaPeriod ?? 0), emaPoints: Number(element.dataset.volumeEmaPoints ?? 0),
  })));
  const indexVolume = pricePaneVolumes.find((row) => row.id === "v2-chart-body-underlying");
  check("index-current-month-future-volume", Boolean(indexVolume?.label.includes("Current-month future") && indexVolume.points > 0), JSON.stringify(indexVolume));
  check("exact-ce-pe-volume-panes", pricePaneVolumes.length === 3 && pricePaneVolumes.every((row) => row.points > 0) && pricePaneVolumes.some((row) => row.label === "Exact CE contract volume") && pricePaneVolumes.some((row) => row.label === "Exact PE contract volume"), JSON.stringify(pricePaneVolumes));
  check("five-minute-volume-ema20", pricePaneVolumes.every((row) => row.emaPeriod === 20 && row.emaPoints > 0), JSON.stringify(pricePaneVolumes));
  const references = await page.getByTestId("v2-chart-body-underlying").evaluate((element) => (element.dataset.referenceLevelsVisible ?? "").split(",").filter(Boolean));
  check("underlying-reference-lines-only", references.every((id) => ["today-open", "previous-day-close", "previous-day-high"].includes(id)), JSON.stringify(references));

  const oiHistoryImages = page.locator("[data-testid='v2-oi-difference-time'] [role='img'], [data-testid='v2-change-oi-difference-time'] [role='img']");
  if (await oiHistoryImages.count()) {
    await oiHistoryImages.first().scrollIntoViewIfNeeded();
    const historyBox = await oiHistoryImages.first().boundingBox();
    if (historyBox) await page.mouse.move(historyBox.x + historyBox.width * 0.55, historyBox.y + historyBox.height * 0.52);
    await page.waitForTimeout(180);
    const historyCursor = await page.evaluate(() => ["underlying", "call", "put"].map((id) => document.querySelector(`[data-testid="v2-chart-host-${id}"]`)?.dataset.crosshairTime ?? ""));
    check("oi-history-hover-sync", historyCursor[0] !== "" && historyCursor.every((value) => value === historyCursor[0]), JSON.stringify(historyCursor));
    const activeTime = await oiHistoryImages.evaluateAll((elements) => elements.map((element) => element.dataset.activeTimeMs));
    check("oi-history-shared-active-time", activeTime.length === 2 && activeTime[0] !== "" && activeTime[0] === activeTime[1], JSON.stringify(activeTime));
  } else {
    check("oi-history-unavailable-honest", historyText.includes("history unavailable"), historyText);
  }

  await page.getByRole("button", { name: "Total OI", exact: true }).click();
  await page.waitForTimeout(250);
  if (await page.getByTestId("v2-oi-differences-time").count()) {
    await page.getByTestId("v2-oi-differences-time").waitFor({ state: "visible" });
    await page.getByTestId("v2-pcr-time").waitFor({ state: "visible" });
    check("oi-difference-time-chart", await page.getByTestId("v2-oi-differences-time").getByRole("img").count() === 1, "PE OI minus CE OI and PE reported Delta OI minus CE reported Delta OI share timestamp X with independent Y axes");
    check("pcr-time-chart", await page.getByTestId("v2-pcr-time").getByRole("img").count() === 1, "OI PCR PE divided by CE is plotted over retained timestamps");
  } else {
    check("oi-time-unavailable-honest", await page.getByText("OI history unavailable", { exact: true }).count() >= 1, "No retained timestamp history; unavailable state shown instead of fabricated lines");
  }

  const popupPromise = page.waitForEvent("popup");
  await page.getByTestId("v2-popout").click();
  const popup = await popupPromise;
  await popup.waitForLoadState("domcontentloaded");
  await popup.getByTestId("scalper-v2").waitFor({ state: "visible", timeout: 90_000 }).catch(async (error) => {
    throw new Error(`Popout did not mount: ${JSON.stringify({ url: popup.url(), body: (await popup.locator("body").innerText()).slice(0, 2_000), error: String(error) })}`);
  });
  check("popout-route", new URL(popup.url()).searchParams.get("popout") === "scalper_v2", popup.url());
  check("popout-minimal-shell", await popup.locator("[data-scalper-popout='true']").count() === 1 && await popup.locator("header").filter({ has: popup.getByText("NIFTY 50 TRADER") }).count() === 0, "global application chrome is absent");
  check("popout-filters", await popup.getByLabel("Analytics underlying").count() === 1 && await popup.getByLabel("Selected CE strike").count() === 1 && await popup.getByLabel("Selected PE strike").count() === 1, "underlying and exact contract filters remain available");

  const stockPage = await context.newPage();
  await stockPage.goto(`${appOrigin}/n50/strategy/trading-analytics?view=scalper_v2&interval=5&symbol=RELIANCE`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await stockPage.getByTestId("scalper-v2").waitFor({ state: "visible", timeout: 90_000 });
  const stockVolume = await stockPage.getByTestId("v2-chart-body-underlying").evaluate((element) => ({ label: element.dataset.volumeLabel ?? "", points: Number(element.dataset.volumePoints ?? 0) }));
  check("stock-cash-volume", stockVolume.label.includes("Cash stock") && stockVolume.points > 0, JSON.stringify(stockVolume));
  await stockPage.close();
  await popup.screenshot({ path: path.join(output, "scalper-v2-popout-1920x1080.png"), fullPage: false });
  await page.screenshot({ path: path.join(output, "scalper-v2-main-1920x1080.png"), fullPage: true });
  check("no-page-errors", errors.length === 0, errors.join(" | ") || "none");
  await fs.writeFile(path.join(output, "results.json"), JSON.stringify({ appOrigin, injectOiHistory, layout, historyGeometry, cursor, results }, null, 2));
} finally {
  await browser.close();
}
console.log(JSON.stringify({ output, passed: results.filter((row) => row.status === "PASS").length, total: results.length, failed: results.filter((row) => row.status === "FAIL") }, null, 2));
if (results.some((row) => row.status === "FAIL")) process.exitCode = 1;
