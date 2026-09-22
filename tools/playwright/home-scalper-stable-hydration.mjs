import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const appOrigin = (process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:15186/n50").replace(/\/$/, "");
const authOrigin = (process.env.PLAYWRIGHT_AUTH_ORIGIN ?? "http://127.0.0.1:19090/n50").replace(/\/$/, "");
const output = path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR ?? "output/playwright/home-scalper-stable-hydration");
const envText = await fs.readFile(process.env.PLAYWRIGHT_ENV_FILE ?? ".env", "utf8");
const password = (process.env.PLAYWRIGHT_ADMIN_PASSWORD ?? envText.split(/\r?\n/).find((line) => line.startsWith("DEV_LOCAL_AUTH_PASSWORD="))?.split("=").slice(1).join("=").trim())?.replace(/^"|"$/g, "");
if (!password) throw new Error("Protected browser-test password is unavailable");
await fs.mkdir(output, { recursive: true });

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, status: pass ? "PASS" : "FAIL", detail });
  if (!pass) throw new Error(`${name}: ${detail}`);
};
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const login = await context.request.post(`${authOrigin}/auth/session/dev-login`, { data: { identifier: "admin", password }, headers: { Origin: new URL(authOrigin).origin } });
  check("Authenticated browser", login.ok(), `HTTP ${login.status()}`);
  const session = (await context.storageState()).cookies.find((cookie) => cookie.name.includes("session"));
  if (session && new URL(appOrigin).hostname === "127.0.0.1") await context.addCookies([{ ...session, domain: "127.0.0.1", path: "/", secure: false, sameSite: "Lax" }]);

  const home = await context.newPage();
  const homeErrors = [];
  let homeNavigations = 0;
  home.on("pageerror", (error) => homeErrors.push(String(error)));
  home.on("framenavigated", (frame) => { if (frame === home.mainFrame()) homeNavigations += 1; });
  await home.route("**/v1/overview", async (route) => { await delay(4_000); await route.continue(); });
  await home.route("**/v1/strategy/three-month**", async (route) => { await delay(8_000); await route.continue(); });
  await home.goto(`${appOrigin}/`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  const homeRoot = home.getByTestId("today-summary");
  await homeRoot.waitFor({ state: "visible", timeout: 15_000 }).catch(async () => {
    throw new Error(`Home root did not mount: ${JSON.stringify({ url: home.url(), body: (await home.locator("body").innerText()).slice(0, 1_500), errors: homeErrors })}`);
  });
  const homeLoadingBox = await homeRoot.boundingBox();
  const initialHomeNavigations = homeNavigations;
  await homeRoot.evaluate((node) => { window.__stableHomeRoot = node; });
  check("Home reserves a viewport while overview hydrates", Number(homeLoadingBox?.height) >= 700, JSON.stringify(homeLoadingBox));
  await homeRoot.locator('[data-testid="home-three-month-selector"]').waitFor({ state: "visible", timeout: 45_000 });
  const boardBefore = await homeRoot.locator('[data-testid="home-three-month-selector"]').boundingBox();
  await home.waitForTimeout(9_000);
  const boardAfter = await homeRoot.locator('[data-testid="home-three-month-selector"]').boundingBox();
  check("Home root stays mounted through hydration", await home.evaluate(() => window.__stableHomeRoot?.isConnected === true && window.__stableHomeRoot === document.querySelector('[data-testid="today-summary"]')), "same connected root");
  check("Home does not navigate during hydration", homeNavigations === initialHomeNavigations, `before=${initialHomeNavigations} after=${homeNavigations}`);
  check("3Month board keeps stable loading geometry", Math.abs(Number(boardAfter?.height) - Number(boardBefore?.height)) <= 4, JSON.stringify({ boardBefore, boardAfter }));
  check("Home has no runtime errors", homeErrors.length === 0, JSON.stringify(homeErrors));
  await home.screenshot({ path: path.join(output, "home-stable-after-hydration.png"), fullPage: false });

  const scalper = await context.newPage();
  const scalperErrors = [];
  let scalperNavigations = 0;
  scalper.on("pageerror", (error) => scalperErrors.push(String(error)));
  scalper.on("framenavigated", (frame) => { if (frame === scalper.mainFrame()) scalperNavigations += 1; });
  await scalper.route("**/v1/trading-analytics/scalper-context**", async (route) => { await delay(3_000); await route.continue(); });
  await scalper.route("**/v1/trading-analytics/charts**", async (route) => { await delay(8_000); await route.continue(); });
  await scalper.goto(`${appOrigin}/strategy/trading-analytics?view=scalper_v2&interval=5`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  const contextLoading = scalper.getByTestId("scalper-v2-context-loading");
  await contextLoading.waitFor({ state: "visible", timeout: 15_000 });
  const initialScalperNavigations = scalperNavigations;
  const contextBox = await contextLoading.boundingBox();
  check("Scalper context loader reserves workstation viewport", Number(contextBox?.height) >= 700, JSON.stringify(contextBox));
  const chartLoading = scalper.getByTestId("scalper-v2-loading");
  await chartLoading.waitFor({ state: "visible", timeout: 30_000 });
  const chartLoadingBox = await chartLoading.boundingBox();
  check("Scalper chart loader reserves workstation viewport", Number(chartLoadingBox?.height) >= 700, JSON.stringify(chartLoadingBox));
  const terminal = scalper.getByTestId("scalper-v2");
  await terminal.waitFor({ state: "visible", timeout: 120_000 });
  const terminalBox = await terminal.boundingBox();
  check("Scalper geometry remains continuous at hydration", Math.abs(Number(terminalBox?.height) - Number(chartLoadingBox?.height)) <= 120, JSON.stringify({ chartLoadingBox, terminalBox }));
  check("Scalper does not navigate during hydration", scalperNavigations === initialScalperNavigations, `before=${initialScalperNavigations} after=${scalperNavigations}`);
  check("Scalper has no runtime errors", scalperErrors.length === 0, JSON.stringify(scalperErrors));
  await scalper.screenshot({ path: path.join(output, "scalper-stable-after-hydration.png"), fullPage: false });
  await context.close();
} finally {
  await browser.close();
  await fs.writeFile(path.join(output, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
}

console.log(JSON.stringify({ passed: results.filter((row) => row.status === "PASS").length, total: results.length, output }, null, 2));
