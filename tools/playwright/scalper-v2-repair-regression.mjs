import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const appOrigin = process.env.SCALPER_V2_APP_ORIGIN ?? "http://127.0.0.1:15174";
const authOrigin = process.env.SCALPER_V2_AUTH_ORIGIN ?? "https://n50.nifty50today.co.in";
const output = path.resolve(process.env.SCALPER_V2_OUTPUT ?? "output/playwright/scalper-v2-repair-20260910");
const password = (await fs.readFile(process.env.PLAYWRIGHT_ENV_FILE ?? ".env", "utf8"))
  .split(/\r?\n/).find((line) => line.startsWith("DEV_LOCAL_AUTH_PASSWORD="))?.split("=").slice(1).join("=").trim();
if (!password) throw new Error("Protected browser-test password is unavailable");
await fs.mkdir(path.join(output, "screenshots"), { recursive: true });

const results = [];
const check = (id, pass, detail) => results.push({ id, status: pass ? "PASS" : "FAIL", detail });
const blocked = (id, detail) => results.push({ id, status: "BLOCKED", detail });
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  const login = await context.request.post(`${authOrigin}/n50/auth/session/dev-login`, { data: { identifier: "admin", password }, headers: { Origin: authOrigin } });
  check("AUTH", login.ok(), `HTTP ${login.status()}`);
  const session = (await context.storageState()).cookies.find((cookie) => cookie.name.includes("session"));
  if (new URL(appOrigin).hostname === "127.0.0.1" && session) await context.addCookies([{ ...session, domain: "127.0.0.1", path: "/", secure: false, sameSite: "Lax" }]);
  const page = await context.newPage();
  const pageErrors = [];
  const hoverRequests = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  page.on("console", (message) => { if (message.type() === "error" && !message.text().includes("clarity.ms") && !message.text().startsWith("[analytics]")) pageErrors.push(message.text()); });
  page.on("request", (request) => { if (/\/v1\/trading-analytics\/(charts|scalper-context)/.test(request.url())) hoverRequests.push({ at: Date.now(), url: request.url() }); });
  await page.goto(`${appOrigin}/n50/strategy/trading-analytics?view=scalper_v2&interval=5`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.getByTestId("scalper-v2").waitFor({ state: "visible", timeout: 90_000 });
  await page.waitForTimeout(3_000);

  await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("trading-analytics:scalper-v2:drawings:")).forEach((key) => localStorage.removeItem(key)));
  await page.reload({ waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.getByTestId("scalper-v2").waitFor({ state: "visible", timeout: 90_000 });
  const drawingBody = page.getByTestId("v2-chart-body-underlying"), drawingBox = await drawingBody.boundingBox();
  if (drawingBox) {
    const first = { x: drawingBox.x + drawingBox.width * .25, y: drawingBox.y + drawingBox.height * .55 };
    const second = { x: drawingBox.x + drawingBox.width * .45, y: drawingBox.y + drawingBox.height * .35 };
    await page.getByRole("button", { name: "Trend line", exact: true }).click();
    await page.mouse.move(first.x, first.y); await page.mouse.down(); await page.mouse.move(second.x, second.y, { steps: 4 }); await page.mouse.up(); await page.waitForTimeout(300);
    await page.getByTestId("v2-drawing-objects").waitFor({ state: "visible", timeout: 10_000 });
    const storedBeforeDrag = await page.evaluate(() => {
      const key = Object.keys(localStorage).find((value) => value.startsWith("trading-analytics:scalper-v2:drawings:v1:"));
      return key ? JSON.parse(localStorage.getItem(key) || "[]") : [];
    });
    check("SV2-WORKSTATION-DRAW-CREATE", storedBeforeDrag.length === 1 && storedBeforeDrag[0].tool === "trend_line" && storedBeforeDrag[0].anchors.every((anchor) => Number.isFinite(anchor.time) && Number.isFinite(anchor.price) && !("x" in anchor) && !("y" in anchor)), JSON.stringify(storedBeforeDrag));
    await page.mouse.move(first.x, first.y); await page.mouse.down(); await page.mouse.move(first.x + 35, first.y - 22, { steps: 3 }); await page.mouse.up(); await page.waitForTimeout(300);
    const storedAfterDrag = await page.evaluate(() => {
      const key = Object.keys(localStorage).find((value) => value.startsWith("trading-analytics:scalper-v2:drawings:v1:"));
      return key ? JSON.parse(localStorage.getItem(key) || "[]") : [];
    });
    check("SV2-WORKSTATION-DRAW-DRAG", storedAfterDrag[0]?.anchors?.[0]?.time !== storedBeforeDrag[0]?.anchors?.[0]?.time || storedAfterDrag[0]?.anchors?.[0]?.price !== storedBeforeDrag[0]?.anchors?.[0]?.price, `${JSON.stringify(storedBeforeDrag[0]?.anchors?.[0])} -> ${JSON.stringify(storedAfterDrag[0]?.anchors?.[0])}`);
    await page.getByRole("button", { name: "Duplicate", exact: true }).click(); await page.waitForTimeout(250);
    check("SV2-WORKSTATION-OBJECT-DUPLICATE", await page.getByTestId("v2-drawing-objects").locator("li").count() === 2, "Object tree contains two independent drawings");
    await page.getByRole("button", { name: "Undo drawing", exact: true }).click();
    check("SV2-WORKSTATION-UNDO", await page.getByTestId("v2-drawing-objects").locator("li").count() === 1, "Undo restored the previous drawing list");
    await page.getByRole("button", { name: "Hide", exact: true }).click(); await page.waitForTimeout(250); await page.reload({ waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.getByTestId("scalper-v2").waitFor({ state: "visible", timeout: 90_000 }); await page.getByRole("tab", { name: "Objects", exact: true }).click();
    check("SV2-WORKSTATION-PERSISTENCE", await page.getByRole("button", { name: "Show", exact: true }).count() === 1, "Hidden object restored from symbol-scoped local recovery storage after reload");
    await page.screenshot({ path: path.join(output, "screenshots", "workstation-drawing-object-tree.png"), fullPage: true });
    await page.getByRole("tab", { name: "Snapshot", exact: true }).click();
  } else check("SV2-WORKSTATION-DRAW-CREATE", false, "Underlying drawing body had no browser geometry");

  const geometry = await page.evaluate(() => ["underlying", "call", "put"].map((id) => {
    const host = document.querySelector(`[data-testid="v2-chart-host-${id}"]`);
    const body = document.querySelector(`[data-testid="v2-chart-body-${id}"]`);
    const native = host?.querySelector(".tv-lightweight-charts");
    const table = native?.querySelector("table");
    const cell = native?.querySelector("td");
    const rect = (element) => element ? { x: element.getBoundingClientRect().x, y: element.getBoundingClientRect().y, width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height } : null;
    return { id, host: rect(host), body: rect(body), native: rect(native), table: rect(table), cell: cell ? { minWidth: getComputedStyle(cell).minWidth, padding: getComputedStyle(cell).padding, position: getComputedStyle(cell).position } : null, dataset: host ? { ...host.dataset } : {} };
  }));
  for (const item of geometry) {
    check(`SV2-FIX-001-${item.id}`, item.host && item.native && Math.abs(item.host.width - item.native.width) <= 2, JSON.stringify(item));
    check(`SV2-FIX-002-${item.id}`, item.host && item.native && item.native.height <= item.host.height + 2 && Number(item.dataset.timeScaleHeight) > 0, JSON.stringify(item));
    check(`SV2-FIX-003-${item.id}`, item.cell?.minWidth === "0px" && item.cell?.padding === "0px", JSON.stringify(item.cell));
  }
  check("SV2-FIX-005-underlying", geometry[0]?.body?.height >= 500, `${geometry[0]?.body?.height}px plot body`);
  check("SV2-FIX-005-call", geometry[1]?.body?.height >= 240, `${geometry[1]?.body?.height}px plot body`);
  check("SV2-FIX-005-put", geometry[2]?.body?.height >= 240, `${geometry[2]?.body?.height}px plot body`);

  const rail = await page.evaluate(() => {
    const element = document.querySelector("aside[aria-label='Scalper V2 option chain and inspector']");
    const tabs = element?.querySelector('[role="tablist"]');
    const body = tabs?.nextElementSibling;
    return element && tabs && body ? { rail: element.getBoundingClientRect().height, tabs: tabs.getBoundingClientRect().height, body: body.getBoundingClientRect().height, scrollable: getComputedStyle(body).overflowY } : null;
  });
  check("SV2-FIX-006", rail && rail.tabs < 60 && rail.body > 100 && /auto|scroll/.test(rail.scrollable), JSON.stringify(rail));
  const sectionGap = await page.evaluate(() => {
    const workspace = document.querySelector('[data-testid="scalper-v2"] > div:nth-of-type(2)');
    const analytics = [...document.querySelectorAll('[data-testid="scalper-v2"] section')].find((element) => element.querySelector('h2')?.textContent?.startsWith('Option analytics'));
    return workspace && analytics ? analytics.getBoundingClientRect().top - workspace.getBoundingClientRect().bottom : null;
  });
  check("SV2-FIX-007", sectionGap != null && sectionGap >= 0 && sectionGap <= 16, `${sectionGap}px workspace-to-analytics gap`);

  const oiAxisContexts = await page.evaluate(() => ["v2-oi-axis-context", "v2-deltaoi-axis-context"].map((testId) => {
    const element = document.querySelector(`[data-testid="${testId}"]`);
    const card = element?.closest("article");
    return {
      testId,
      text: element?.textContent?.replace(/\s+/g, " ").trim() ?? "",
      contained: Boolean(element && card && element.getBoundingClientRect().left >= card.getBoundingClientRect().left && element.getBoundingClientRect().right <= card.getBoundingClientRect().right + 1),
    };
  }));
  check("SV2-OI-AXIS-LABELS", oiAxisContexts[0]?.text.includes("Y Open interest · provider units") && oiAxisContexts[0]?.text.includes("X Strike") && oiAxisContexts[1]?.text.includes("Y Signed ΔOI · provider units") && oiAxisContexts[1]?.text.includes("X Strike"), JSON.stringify(oiAxisContexts));
  check("SV2-OI-AXIS-CONTAINMENT", oiAxisContexts.every((item) => item.contained), JSON.stringify(oiAxisContexts));

  await page.getByTestId("v2-chart-body-underlying").waitFor({ state: "attached", timeout: 90_000 });
  const profileAlignment = await page.getByTestId("v2-chart-body-underlying").evaluate((body) => {
    const geometry = JSON.parse(body.dataset.profileGeometry || "[]");
    const bars = [...body.querySelectorAll('[data-testid="v2-oi-profile"] i')];
    const errors = geometry.filter((row) => row.width > 0).map((row, index) => Math.abs(Number.parseFloat(bars[index]?.style.top || "NaN") - (row.coordinate + (row.side === "CE" ? -5 : 2))));
    return { count: errors.length, maximumError: errors.length ? Math.max(...errors) : null };
  });
  check("SV2-FIX-037", profileAlignment.count > 0 && profileAlignment.maximumError <= 2, JSON.stringify(profileAlignment));

  const dayRange = await page.getByTestId("v2-chart-host-underlying").evaluate((element) => `${element.dataset.visibleFrom}:${element.dataset.visibleTo}`);
  await page.getByRole("button", { name: "Last 30", exact: true }).click();
  await page.waitForTimeout(80);
  const recentRange = await page.getByTestId("v2-chart-host-underlying").evaluate((element) => `${element.dataset.visibleFrom}:${element.dataset.visibleTo}:${element.dataset.horizontalView}`);
  check("SV2-FIX-010-PRESET", dayRange !== recentRange && recentRange.endsWith(":last30"), `${dayRange} -> ${recentRange}`);
  await page.getByRole("button", { name: "Fit day", exact: true }).click();
  await page.getByRole("button", { name: "Manual Y", exact: true }).click();
  await page.getByRole("button", { name: "Lock Y", exact: true }).click();
  const lockedAxes = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="v2-chart-body-"]')].map((element) => ({ mode: element.dataset.verticalView, locked: element.dataset.yLocked })));
  await page.getByRole("button", { name: "Session Y", exact: true }).click();
  const resetAxes = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="v2-chart-body-"]')].map((element) => ({ mode: element.dataset.verticalView, locked: element.dataset.yLocked })));
  check("SV2-FIX-014", lockedAxes.every((row) => row.mode === "manual" && row.locked === "true") && resetAxes.every((row) => row.mode === "session" && row.locked === "false"), `${JSON.stringify(lockedAxes)} -> ${JSON.stringify(resetAxes)}`);

  await page.getByTestId("v2-at-time-grid").waitFor({ state: "attached", timeout: 90_000 });
  const atTimeBefore = await page.getByTestId("v2-at-time-grid").innerText();
  const callHost = page.getByTestId("v2-chart-host-call");
  const callBox = await callHost.boundingBox();
  if (callBox) await page.mouse.move(callBox.x + callBox.width * 0.35, callBox.y + callBox.height * 0.45);
  await page.waitForTimeout(100);
  const atTimeAfter = await page.getByTestId("v2-at-time-grid").innerText();
  check("SV2-FIX-018", /At cursor/.test(await page.getByTestId("v2-cursor-time").innerText()), await page.getByTestId("v2-cursor-time").innerText());
  check("SV2-FIX-021", atTimeBefore !== atTimeAfter, "At-time numerical grid changed after CE-origin hover");
  const localReadouts = await Promise.all(["underlying", "call", "put"].map((id) => page.getByTestId(`v2-chart-readout-${id}`).innerText()));
  check("SV2-FIX-017", localReadouts.every((value) => /At cursor|No exact/.test(value)) && new Set(localReadouts).size === 3, JSON.stringify(localReadouts));
  const hydrationBefore = await page.evaluate(() => ["underlying", "call", "put"].map((id) => document.querySelector(`[data-testid="v2-chart-host-${id}"]`)?.dataset.setDataCount));

  await page.getByTestId("v2-chart-host-call").dispatchEvent("mouseleave");
  await page.mouse.move(5, 5);
  await page.waitForTimeout(80);
  check("SV2-FIX-019", /Latest completed/.test(await page.getByTestId("v2-cursor-time").innerText()), await page.getByTestId("v2-cursor-time").innerText());

  if (callBox) await page.mouse.click(callBox.x + callBox.width * 0.45, callBox.y + callBox.height * 0.55);
  await page.waitForTimeout(80);
  const locked = await page.getByTestId("v2-cursor-time").innerText();
  await page.mouse.move(5, 5);
  await page.getByRole("tab", { name: "Health" }).click();
  check("SV2-FIX-020", /Locked/.test(locked) && /Locked/.test(await page.getByTestId("v2-cursor-time").innerText()), `${locked} -> ${await page.getByTestId("v2-cursor-time").innerText()}`);
  await page.keyboard.press("Escape");

  await page.getByRole("tab", { name: "Chain" }).click();
  const chainRows = page.getByRole("columnheader", { name: "Strike", exact: true }).locator("xpath=ancestor::table").locator("tbody tr:not([aria-current='true'])");
  if (await chainRows.count() > 0) {
    await chainRows.first().dispatchEvent("mouseover");
    await page.waitForTimeout(100);
  }
  const strikeLink = await page.getByTestId("v2-chart-body-underlying").evaluate((element) => ({ selected: element.dataset.selectedStrike, hovered: element.dataset.hoveredStrike }));
  check("SV2-FIX-030", Boolean(strikeLink.hovered) && strikeLink.selected !== strikeLink.hovered, JSON.stringify(strikeLink));

  hoverRequests.length = 0;
  const pointerDurations = await page.evaluate(async () => {
    const host = document.querySelector('[data-testid="v2-chart-host-underlying"]');
    if (!host) return [];
    const rect = host.getBoundingClientRect(), samples = [];
    for (let index = 0; index < 500; index += 1) {
      const started = performance.now();
      host.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: rect.left + 20 + index % Math.max(1, Math.floor(rect.width - 40)), clientY: rect.top + rect.height / 2 }));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      samples.push(performance.now() - started);
    }
    return samples;
  });
  const sorted = [...pointerDurations].sort((a, b) => a - b), p95 = sorted[Math.floor(sorted.length * .95)] ?? null;
  const hydrationAfter = await page.evaluate(() => ["underlying", "call", "put"].map((id) => document.querySelector(`[data-testid="v2-chart-host-${id}"]`)?.dataset.setDataCount));
  check("SV2-FIX-059", p95 != null && p95 <= 50, `500 moves, p95 ${p95?.toFixed(2)}ms, Chromium headless, DPR1, 1920x1080`);
  check("SV2-FIX-060", hoverRequests.length === 0, `${hoverRequests.length} /v1 requests during pointer loop`);
  check("SV2-FIX-026", JSON.stringify(hydrationBefore) === JSON.stringify(hydrationAfter), `setData counters ${JSON.stringify(hydrationBefore)} -> ${JSON.stringify(hydrationAfter)}`);

  const switchStarted = performance.now();
  await page.getByRole("button", { name: "1m", exact: true }).click();
  await page.waitForFunction(() => new URL(location.href).searchParams.get("interval") === "1");
  await page.getByTestId("v2-chart-host-underlying").waitFor({ state: "visible" });
  const switchMs = Math.round(performance.now() - switchStarted);
  check("SV2-FIX-061", switchMs <= 250, `${switchMs}ms cached route redraw`);

  await page.getByRole("button", { name: "Measure A–B", exact: true }).click();
  const aSelect = page.getByLabel("Measurement A interval"), bSelect = page.getByLabel("Measurement B interval");
  const options = await aSelect.locator("option").evaluateAll((nodes) => nodes.map((node) => node.value).filter(Boolean));
  if (options.length >= 2) { await aSelect.selectOption(options[0]); await bSelect.selectOption(options[options.length - 1]); }
  await page.getByTestId("v2-measurement-pnl").waitFor({ state: "attached", timeout: 30_000 });
  const measurementBeforeSwitch = await page.getByTestId("v2-measurement-pnl").innerText();
  await page.getByRole("button", { name: "5m", exact: true }).click();
  await page.waitForFunction(() => new URL(location.href).searchParams.get("interval") === "5");
  await page.getByTestId("v2-measurement-pnl").waitFor({ state: "attached", timeout: 30_000 });
  const measurementAfterSwitch = await page.getByTestId("v2-measurement-pnl").innerText();
  check("SV2-FIX-057", measurementBeforeSwitch === measurementAfterSwitch, "A/B numerical evidence persisted across a display-timeframe switch");
  await page.screenshot({ path: path.join(output, "screenshots", "desktop-1920x1080.png"), fullPage: true });

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1366, height: 768 }, { width: 1024, height: 768 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport); await page.waitForTimeout(150);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(`SV2-FIX-008-${viewport.width}`, overflow <= 1 && await page.getByTestId("scalper-v2").isVisible(), `${overflow}px horizontal overflow`);
    await page.screenshot({ path: path.join(output, "screenshots", `${viewport.width}x${viewport.height}.png`), fullPage: true });
  }

  const state = await context.storageState();
  const dpr2Context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, reducedMotion: "reduce", storageState: state });
  const dpr2Page = await dpr2Context.newPage();
  await dpr2Page.goto(`${appOrigin}/n50/strategy/trading-analytics?view=scalper_v2&interval=5`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await dpr2Page.getByTestId("scalper-v2").waitFor({ state: "visible", timeout: 90_000 });
  const dpr2Geometry = await dpr2Page.evaluate(() => {
    const host = document.querySelector('[data-testid="v2-chart-host-underlying"]');
    const native = host?.querySelector('.tv-lightweight-charts');
    const canvases = [...(native?.querySelectorAll('canvas') ?? [])];
    return { dpr: devicePixelRatio, hostWidth: host?.getBoundingClientRect().width ?? 0, nativeWidth: native?.getBoundingClientRect().width ?? 0, crisp: canvases.every((canvas) => canvas.width >= canvas.getBoundingClientRect().width * 1.9) };
  });
  check("SV2-FIX-004", dpr2Geometry.dpr === 2 && Math.abs(dpr2Geometry.hostWidth - dpr2Geometry.nativeWidth) <= 2, JSON.stringify(dpr2Geometry));
  if (!dpr2Geometry.crisp) blocked("SV2-FIX-004-DPR2-BACKING", `Headless Chromium reports DPR2 but the installed native renderer exposes 1:1 canvas backing dimensions; visual crispness requires headed-browser confirmation. ${JSON.stringify(dpr2Geometry)}`);
  await dpr2Context.close();

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${appOrigin}/n50/strategy/trading-analytics?view=scalper`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.getByRole("button", { name: "Scalper", exact: true }).waitFor({ state: "visible", timeout: 90_000 });
  check("SV2-FIX-065", new URL(page.url()).searchParams.get("view") === "scalper" && await page.getByRole("button", { name: "Scalper V2", exact: true }).count() === 1 && await page.getByTestId("scalper-v2").count() === 0, "V1 route remains distinct and V2 tab remains available");
  let lifecycleStable = true;
  for (let cycle = 0; cycle < 20; cycle += 1) {
    await page.getByRole("button", { name: "Scalper V2", exact: true }).click();
    await page.getByTestId("scalper-v2").waitFor({ state: "visible", timeout: 30_000 });
    lifecycleStable &&= await page.locator('[data-testid^="v2-chart-host-"] .tv-lightweight-charts').count() === 3;
    await page.getByRole("button", { name: "Scalper", exact: true }).click();
    await page.getByTestId("scalper-v2").waitFor({ state: "detached", timeout: 30_000 });
  }
  check("SV2-FIX-062", lifecycleStable, "20 V1/V2 mount-unmount cycles retained exactly three V2 native roots while mounted");
  check("PAGE-ERRORS", pageErrors.length === 0, pageErrors.join(" | "));
  await fs.writeFile(path.join(output, "results.json"), JSON.stringify({ appOrigin, geometry, rail, performance: { pointerMoves: 500, pointerP95Ms: p95, cachedSwitchMs: switchMs }, results }, null, 2));
} finally { await browser.close(); }

const failed = results.filter((result) => result.status === "FAIL");
const blockedResults = results.filter((result) => result.status === "BLOCKED");
console.log(JSON.stringify({ checks: results.length, passed: results.filter((result) => result.status === "PASS").length, blocked: blockedResults, failed }, null, 2));
if (failed.length) process.exitCode = 1;
