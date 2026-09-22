import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const appOrigin = process.env.SCALPER_V2_APP_ORIGIN ?? "http://127.0.0.1:19090";
const authOrigin = process.env.SCALPER_V2_AUTH_ORIGIN ?? "http://127.0.0.1:19090";
const output = path.resolve(process.env.SCALPER_V2_OUTPUT ?? "/tmp/scalper-v2-tooltip-expand");
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
  if (session) {
    const target = new URL(appOrigin);
    await context.clearCookies();
    await context.addCookies([{ ...session, domain: target.hostname, path: "/", secure: target.protocol === "https:", sameSite: "Lax" }]);
  }
  const page = await context.newPage();
  const errors = [];
  const requests = [];
  page.on("pageerror", (error) => errors.push(error.stack ?? String(error)));
  page.on("console", (message) => { if (message.type() === "error" && !message.text().includes("clarity.ms")) errors.push(message.text()); });
  page.on("request", (request) => requests.push(request.url()));
  await page.goto(`${appOrigin}/n50/strategy/trading-analytics?view=scalper_v2&interval=5`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.getByTestId("scalper-v2").waitFor({ state: "visible", timeout: 90_000 });
  await page.waitForTimeout(2_000);

  const expandButtons = page.getByRole("button", { name: /^Expand / });
  check("seven-compact-charts-expandable", await expandButtons.count() === 7, `count=${await expandButtons.count()}`);
  await page.getByRole("button", { name: "Expand OI by strike", exact: true }).click();
  const overlay = page.getByTestId("v2-expanded-chart");
  await overlay.waitFor({ state: "visible" });
  const geometry = await overlay.evaluate((element) => { const box = element.getBoundingClientRect(); const chart = element.querySelector('[role="img"]')?.getBoundingClientRect(); return { width: box.width, height: box.height, chartWidth: chart?.width ?? 0, chartHeight: chart?.height ?? 0 }; });
  check("expanded-chart-fills-viewport", geometry.width >= 1900 && geometry.height >= 1060 && geometry.chartHeight >= 950, JSON.stringify(geometry));
  await page.screenshot({ path: path.join(output, "expanded-oi-by-strike.png"), fullPage: false });
  await overlay.getByRole("button", { name: /Close/ }).click();
  check("expanded-chart-closes", await overlay.count() === 0, "on-demand canvas unmounted");

  for (const title of ["Strike structure", "Strike by time positioning"]) {
    await page.getByRole("button", { name: `Show ${title} calculation`, exact: true }).click();
    const info = page.getByTestId("v2-chart-calculation");
    await info.waitFor({ state: "visible" });
    const text = await info.innerText();
    check(`${title}-click-calculation`, title === "Strike structure" ? text.includes("price↑/OI↑") && text.includes("current observation minus") : text.includes("ΔOI share") && text.includes("arithmetic mean"), text.slice(0, 500));
    await info.getByRole("button", { name: /Close/ }).click();
  }

  const oiChart = page.getByTestId("v2-strike-side-charts").locator("article").first().getByRole("img");
  const box = await oiChart.boundingBox();
  const requestCountBeforeHover = requests.length;
  if (box) {
    for (let index = 0; index < 80; index += 1) await page.mouse.move(box.x + 10 + (index % 20) * Math.max(1, (box.width - 20) / 20), box.y + box.height * 0.56);
  }
  await page.waitForTimeout(250);
  const tooltipText = await oiChart.locator("div").allInnerTexts();
  const hoverRequests = requests.slice(requestCountBeforeHover).filter((url) => /\/v1\/trading-analytics\/|option-chain/.test(url));
  check("compact-tooltip-visible", tooltipText.some((text) => /Strike|CE OI|PE OI/.test(text)), tooltipText.join(" | ").slice(0, 500));
  check("hover-does-not-fetch", hoverRequests.length === 0, hoverRequests.join(" | ") || "zero API requests");
  check("no-page-errors", errors.length === 0, errors.join(" | ") || "none");
  await page.screenshot({ path: path.join(output, "compact-tooltip-and-actions.png"), fullPage: false });
  await fs.writeFile(path.join(output, "results.json"), JSON.stringify({ appOrigin, geometry, results }, null, 2));
} finally {
  await browser.close();
}
const failed = results.filter((result) => result.status === "FAIL");
console.log(JSON.stringify({ output, passed: results.length - failed.length, total: results.length, failed }, null, 2));
if (failed.length) process.exitCode = 1;
