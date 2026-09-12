import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const appOrigin = process.env.SCALPER_V2_APP_ORIGIN ?? "http://127.0.0.1:15174";
const authOrigin = process.env.SCALPER_V2_AUTH_ORIGIN ?? "https://n50.nifty50today.co.in";
const output = path.resolve(process.env.SCALPER_V2_OUTPUT ?? "/tmp/scalper-v2-single-workstation");
const envText = await fs.readFile(process.env.PLAYWRIGHT_ENV_FILE ?? ".env", "utf8");
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD
  ?? envText.split(/\r?\n/).find((line) => line.startsWith("DEV_LOCAL_AUTH_PASSWORD="))?.split("=").slice(1).join("=").trim();
if (!password) throw new Error("Protected browser-test password is unavailable");
await fs.mkdir(output, { recursive: true });

const results = [];
const check = (id, pass, detail) => results.push({ id, status: pass ? "PASS" : "FAIL", detail });
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  const login = await context.request.post(`${authOrigin}/n50/auth/session/dev-login`, {
    data: { identifier: "admin", password }, headers: { Origin: authOrigin },
  });
  check("AUTH", login.ok(), `HTTP ${login.status()}`);
  const session = (await context.storageState()).cookies.find((cookie) => cookie.name.includes("session"));
  if (session) await context.addCookies([{ ...session, domain: "127.0.0.1", path: "/", secure: false, sameSite: "Lax" }]);
  const page = await context.newPage();
  const errors = [];
  const hoverRequests = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("request", (request) => {
    if (/\/v1\/trading-analytics\/(charts|scalper-context)/.test(request.url())) hoverRequests.push(request.url());
  });
  await page.goto(`${appOrigin}/n50/strategy/trading-analytics?view=scalper_v2&interval=5`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  const terminal = page.getByTestId("scalper-v2");
  await terminal.waitFor({ state: "visible", timeout: 90_000 });
  await page.waitForTimeout(2_000);

  const geometry = await page.evaluate(() => ["underlying", "call", "put"].map((id) => {
    const body = document.querySelector(`[data-testid="v2-chart-body-${id}"]`);
    const host = document.querySelector(`[data-testid="v2-chart-host-${id}"]`);
    const native = host?.querySelector(".tv-lightweight-charts");
    return {
      id,
      body: body ? { width: body.getBoundingClientRect().width, height: body.getBoundingClientRect().height } : null,
      host: host ? { width: host.getBoundingClientRect().width, height: host.getBoundingClientRect().height } : null,
      native: native ? { width: native.getBoundingClientRect().width, height: native.getBoundingClientRect().height } : null,
      timeScaleHeight: Number(host?.dataset.timeScaleHeight),
    };
  }));
  for (const item of geometry) {
    check(`GEOMETRY-${item.id}`, Boolean(item.host && item.native && Math.abs(item.host.width - item.native.width) <= 2 && item.native.height <= item.host.height + 2 && item.timeScaleHeight > 0), JSON.stringify(item));
  }
  check("READABLE-HEIGHTS", Number(geometry[0]?.body?.height) >= 500 && Number(geometry[1]?.body?.height) >= 240 && Number(geometry[2]?.body?.height) >= 240, JSON.stringify(geometry));
  check("PRIMARY-SNAPSHOT", await terminal.locator("table[aria-label='Selected contracts snapshot metrics']").count() === 1 && await terminal.locator("aside h3", { hasText: "Structure" }).count() === 1, "selected pair and structure are permanent in the rail");
  check("STRUCTURE-MATRIX", await page.getByTestId("v2-strike-matrix").count() === 1, "matrix is visible in the default overview");
  check("ANALYTICS-DOCK", await page.getByTestId("v2-analytics-dock").count() === 1, "single compact analytics dock is mounted");
  const primaryText = await terminal.innerText();
  const forbidden = ["provider-native", "retained cohort", "retained snapshot", "background timeframe cache", "SCALPER_V2_WORKSTATION_V1"];
  check("CUSTOMER-LANGUAGE", forbidden.every((term) => !primaryText.includes(term)), forbidden.filter((term) => primaryText.includes(term)).join(", ") || "no internal terms in primary view");

  const profile = await page.getByTestId("v2-oi-profile").getAttribute("data-mode");
  check("FOUR-LANE-PROFILE", profile === "structure", `profile mode=${profile}`);
  const profileState = await page.getByTestId("v2-chart-body-underlying").evaluate((body) => ({
    geometry: JSON.parse(body.dataset.profileGeometry || "[]"),
    maximumError: Number(body.dataset.profileMaxAlignmentError),
  }));
  check("PROFILE-ALIGNMENT", profileState.geometry.length > 0 && profileState.maximumError <= 2 && new Set(profileState.geometry.map((row) => row.metric)).size === 2, `${profileState.geometry.length} bars; max error=${profileState.maximumError}px; metrics=${[...new Set(profileState.geometry.map((row) => row.metric))].join(",")}`);

  const beforeHoverRequests = hoverRequests.length;
  const beforeSetData = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="v2-chart-host-"]')].map((host) => host.dataset.setDataCount));
  const box = await page.getByTestId("v2-chart-host-underlying").boundingBox();
  if (box) for (let index = 0; index < 100; index += 1) await page.mouse.move(box.x + 5 + (index % 90) / 90 * (box.width - 10), box.y + box.height * .45);
  await page.waitForTimeout(150);
  const afterSetData = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="v2-chart-host-"]')].map((host) => host.dataset.setDataCount));
  check("NO-HOVER-NETWORK", hoverRequests.length === beforeHoverRequests, `${hoverRequests.length - beforeHoverRequests} requests during hover`);
  check("NO-HOVER-HYDRATION", JSON.stringify(beforeSetData) === JSON.stringify(afterSetData), `${JSON.stringify(beforeSetData)} -> ${JSON.stringify(afterSetData)}`);
  await page.screenshot({ path: path.join(output, "workstation-default-1920x1080.png"), fullPage: false });

  const analyticsNav = page.getByRole("navigation", { name: "Scalper analytics" });
  await analyticsNav.getByRole("button", { name: "Price Strength", exact: true }).click();
  const mode = page.getByTestId("v2-normalized-option-price").locator("select");
  check("DEFAULT-PRICE-MODE", await mode.inputValue() === "return", `mode=${await mode.inputValue()}`);
  await page.getByTestId("v2-normalized-option-price").getByRole("img").first().waitFor({ state: "visible", timeout: 10_000 });
  await page.waitForTimeout(300);
  const strengthCharts = await page.getByTestId("v2-normalized-option-price").getByRole("img").count();
  check("HEATMAP", strengthCharts === 2, `price-strength chart count=${strengthCharts}; expected line plus all-strike heatmap`);
  await analyticsNav.getByRole("button", { name: "Total OI", exact: true }).click();
  check("TOTAL-OI-NAME", /Total OI vs Time/.test(await page.getByTestId("v2-cumulative-oi-time").innerText()), "customer-facing total OI semantics");
  await analyticsNav.getByRole("button", { name: "OI & ΔOI", exact: true }).click();
  check("ADAPTIVE-DELTA", await page.getByTestId("v2-deltaoi-chart").count() === 1, "expanded signed ΔOI view remains available");
  await page.screenshot({ path: path.join(output, "desktop-1920x1080.png"), fullPage: true });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(300);
  check("NO-PAGE-X-OVERFLOW-1440", await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), "page width contained");
  await page.screenshot({ path: path.join(output, "desktop-1440x900.png"), fullPage: true });
  await page.goto(`${appOrigin}/n50/strategy/trading-analytics?view=scalper&interval=5`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.getByRole("button", { name: "Scalper V2", exact: true }).waitFor({ state: "visible", timeout: 90_000 });
  check("ORIGINAL-SCALPER-PRESERVED", new URL(page.url()).searchParams.get("view") === "scalper" && await page.getByTestId("scalper-v2").count() === 0, "original Scalper remains a distinct route");
  check("NO-PAGE-ERRORS", errors.length === 0, errors.join(" | ") || "none");
  await fs.writeFile(path.join(output, "results.json"), JSON.stringify({ appOrigin, geometry, results }, null, 2));
} finally {
  await browser.close();
}
console.log(JSON.stringify({ checks: results.length, passed: results.filter((row) => row.status === "PASS").length, failed: results.filter((row) => row.status === "FAIL") }, null, 2));
if (results.some((row) => row.status === "FAIL")) process.exitCode = 1;
