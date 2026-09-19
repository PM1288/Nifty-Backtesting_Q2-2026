import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const appOrigin = process.env.SCALPER_V2_APP_ORIGIN ?? "http://127.0.0.1:15190";
const authOrigin = process.env.SCALPER_V2_AUTH_ORIGIN ?? "http://127.0.0.1:19090";
const output = path.resolve(process.env.SCALPER_V2_OUTPUT ?? "/tmp/scalper-v2-popout-structure-20260919");
const testDay = process.env.SCALPER_V2_TEST_DAY ?? "";
const testAsOf = process.env.SCALPER_V2_TEST_AS_OF ?? "";
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
  const login = await context.request.post(`${authOrigin}/n50/auth/session/dev-login`, { data: { identifier: "admin", password }, headers: { Origin: authOrigin } });
  check("authenticated", login.ok(), `HTTP ${login.status()}`);
  const session = (await context.storageState()).cookies.find((cookie) => cookie.name.includes("session"));
  if (session && new URL(appOrigin).hostname === "127.0.0.1") await context.addCookies([{ ...session, domain: "127.0.0.1", path: "/", secure: false, sameSite: "Lax" }]);

  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  const dayQuery = testDay ? `&day=${encodeURIComponent(testDay)}` : "";
  const asOfQuery = testAsOf ? `&asOf=${encodeURIComponent(testAsOf)}` : "";
  await page.goto(`${appOrigin}/n50/strategy/trading-analytics?view=scalper_v2&interval=5${dayQuery}${asOfQuery}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.getByTestId("scalper-v2").waitFor({ state: "visible", timeout: 90_000 });
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
      charts: rect("[data-testid='v2-strike-side-charts']"),
      details: rect("aside[aria-label='Scalper V2 option chain and inspector']"),
      workspace: rect("[data-testid='v2-strike-side-charts']")?.x == null ? null : rect("[data-testid='v2-strike-side-charts']")?.y,
      gauge: rect("[data-testid='v2-underlying-level-gauge']"),
    };
  });
  check("right-side-strike-charts", await page.getByTestId("v2-strike-side-charts").getByRole("img").count() === 2, "OI and change-in-OI charts mounted");
  check("strike-charts-vertical", /Bars: CE \/ PE · line: PE − CE/.test(await page.getByTestId("v2-strike-side-charts").innerText()), await page.getByTestId("v2-strike-side-charts").innerText());
  const sideGeometry = await page.getByTestId("v2-strike-side-charts").evaluate((element) => [...element.querySelectorAll("article")].map((article) => {
    const chart = article.querySelector('[role="img"]');
    const outer = article.getBoundingClientRect();
    const inner = chart?.getBoundingClientRect();
    return { outerWidth: outer.width, chartWidth: inner?.width ?? 0, outerHeight: outer.height, chartHeight: inner?.height ?? 0 };
  }));
  check("side-chart-host-near-edge", sideGeometry.every((item) => item.outerWidth - item.chartWidth <= 6), JSON.stringify(sideGeometry));
  await page.screenshot({ path: path.join(output, "scalper-v2-side-charts-1920x1080.png"), fullPage: false });
  check("details-moved-below", Boolean(layout.details && layout.charts && layout.details.y >= layout.charts.y + layout.charts.height - 2), JSON.stringify(layout));
  check("top-current-values", (await page.locator("[aria-label='Current selected values'] span").count()) === 3, "underlying, CE and PE values shown in the command bar");

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
  const indexVolume = await page.getByTestId("v2-chart-body-underlying").evaluate((element) => ({ label: element.dataset.volumeLabel ?? "", points: Number(element.dataset.volumePoints ?? 0) }));
  check("index-current-month-future-volume", indexVolume.label.includes("Current-month future") && indexVolume.points > 0, JSON.stringify(indexVolume));

  await page.getByRole("button", { name: "Total OI", exact: true }).click();
  await page.waitForTimeout(250);
  if (await page.getByTestId("v2-oi-differences-time").count()) {
    await page.getByTestId("v2-oi-differences-time").waitFor({ state: "visible" });
    await page.getByTestId("v2-pcr-time").waitFor({ state: "visible" });
    check("oi-difference-time-chart", await page.getByTestId("v2-oi-differences-time").getByRole("img").count() === 1, "PE OI minus CE OI and PE reported Delta OI minus CE reported Delta OI share timestamp X with independent Y axes");
    check("pcr-time-chart", await page.getByTestId("v2-pcr-time").getByRole("img").count() === 1, "OI PCR PE divided by CE is plotted over retained timestamps");
  } else {
    check("oi-time-unavailable-honest", await page.getByText("OI history unavailable", { exact: true }).count() === 1, "No retained timestamp history; unavailable state shown instead of fabricated lines");
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
  await fs.writeFile(path.join(output, "results.json"), JSON.stringify({ appOrigin, layout, sideGeometry, cursor, results }, null, 2));
} finally {
  await browser.close();
}
console.log(JSON.stringify({ output, passed: results.filter((row) => row.status === "PASS").length, total: results.length, failed: results.filter((row) => row.status === "FAIL") }, null, 2));
if (results.some((row) => row.status === "FAIL")) process.exitCode = 1;
