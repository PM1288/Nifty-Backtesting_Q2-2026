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
  await page.waitForTimeout(1_000);

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
  const chainRows = page.locator("aside[aria-label='Scalper V2 option chain and inspector'] tbody tr");
  if (await chainRows.count() > 1) await chainRows.nth(0).hover();
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
  check("SV2-FIX-059", p95 != null && p95 <= 50, `500 moves, p95 ${p95?.toFixed(2)}ms, Chromium headless, DPR1, 1920x1080`);
  check("SV2-FIX-060", hoverRequests.length === 0, `${hoverRequests.length} /v1 requests during pointer loop`);

  const switchStarted = performance.now();
  await page.getByRole("button", { name: "1m", exact: true }).click();
  await page.waitForFunction(() => new URL(location.href).searchParams.get("interval") === "1");
  await page.getByTestId("v2-chart-host-underlying").waitFor({ state: "visible" });
  const switchMs = Math.round(performance.now() - switchStarted);
  check("SV2-FIX-061", switchMs <= 250, `${switchMs}ms cached route redraw`);
  await page.screenshot({ path: path.join(output, "screenshots", "desktop-1920x1080.png"), fullPage: true });

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1366, height: 768 }, { width: 1024, height: 768 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport); await page.waitForTimeout(150);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(`SV2-FIX-008-${viewport.width}`, overflow <= 1 && await page.getByTestId("scalper-v2").isVisible(), `${overflow}px horizontal overflow`);
    await page.screenshot({ path: path.join(output, "screenshots", `${viewport.width}x${viewport.height}.png`), fullPage: true });
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${appOrigin}/n50/strategy/trading-analytics?view=scalper`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.getByRole("button", { name: "Scalper", exact: true }).waitFor({ state: "visible", timeout: 90_000 });
  check("SV2-FIX-065", new URL(page.url()).searchParams.get("view") === "scalper" && await page.getByRole("button", { name: "Scalper V2", exact: true }).count() === 1 && await page.getByTestId("scalper-v2").count() === 0, "V1 route remains distinct and V2 tab remains available");
  check("PAGE-ERRORS", pageErrors.length === 0, pageErrors.join(" | "));
  await fs.writeFile(path.join(output, "results.json"), JSON.stringify({ appOrigin, geometry, rail, performance: { pointerMoves: 500, pointerP95Ms: p95, cachedSwitchMs: switchMs }, results }, null, 2));
} finally { await browser.close(); }

const failed = results.filter((result) => result.status === "FAIL");
console.log(JSON.stringify({ checks: results.length, passed: results.length - failed.length, failed }, null, 2));
if (failed.length) process.exitCode = 1;
