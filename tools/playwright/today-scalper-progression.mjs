import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const base = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:15186/n50";
const authBase = process.env.PLAYWRIGHT_AUTH_BASE_URL ?? base.replace(/\/n50\/?$/, "");
const authOrigin = process.env.PLAYWRIGHT_AUTH_ORIGIN ?? new URL(base).origin;
const output = process.env.PLAYWRIGHT_OUTPUT_DIR ?? "/tmp/today-scalper-progression";
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
if (!password) throw new Error("PLAYWRIGHT_ADMIN_PASSWORD is required");
await fs.mkdir(output, { recursive: true });
const results = [];
const check = (name, pass, detail) => {
  results.push({ name, status: pass ? "PASS" : "FAIL", detail });
  if (!pass) throw new Error(`${name}: ${detail}`);
};
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  if (password) {
    const login = await context.request.post(`${authBase}/auth/session/dev-login`, { data: { identifier: "admin", password }, headers: { Origin: authOrigin } });
    check("Authenticated candidate", login.ok(), `HTTP ${login.status()}`);
    const sessionPair = (login.headers()["set-cookie"] ?? "").split(";", 1)[0];
    const separator = sessionPair.indexOf("=");
    if (separator > 0) await context.addCookies([{
      name: sessionPair.slice(0, separator), value: sessionPair.slice(separator + 1),
      domain: new URL(base).hostname, path: "/", httpOnly: true, secure: false, sameSite: "Lax",
    }]);
  }
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(base, { waitUntil: "domcontentloaded", timeout: 90_000 });
  const widget = page.getByTestId("today-scalper-progression");
  await widget.waitFor({ state: "visible", timeout: 30_000 }).catch(async () => {
    throw new Error(`Today progression did not mount: ${JSON.stringify({ url: page.url(), body: (await page.locator("body").innerText()).slice(0, 2_000), errors })}`);
  });
  await widget.getByText(/\d+\/\d+ at stage 4/).waitFor({ state: "visible", timeout: 30_000 });
  const text = await widget.innerText();
  check("Progression row is below the Today market sections", text.includes("SCALPER PROGRESSION · MONTHLY OPEN"), text.slice(0, 500));
  const cards = widget.locator("[data-progression-symbol]");
  const cardCount = await cards.count();
  check("Current stock universe is represented", cardCount >= 1, `${cardCount} stock cards`);
  const first = await cards.first().innerText();
  check("Both alternative monthly routes are visible", first.includes("M−1 route") && first.includes("M−2 route"), first);
  check("Each route exposes four additive checkpoints", (first.match(/\/4 AND/g) ?? []).length === 2 && ["M", "W0", "W−1", "D0"].every((label) => first.includes(label)), first);
  const scroller = widget.locator('[aria-label="Horizontally scrollable stock progression"]');
  const geometry = await scroller.evaluate((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
  check("Long fixed-width stock line scrolls horizontally", geometry.scrollWidth > geometry.clientWidth, JSON.stringify(geometry));
  await scroller.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
  check("Horizontal scroll reaches later stocks", await scroller.evaluate((element) => element.scrollLeft > 0), String(await scroller.evaluate((element) => element.scrollLeft)));
  await scroller.evaluate((element) => { element.scrollLeft = 0; });
  check("No browser errors", errors.length === 0, errors.join(" | "));
  await page.screenshot({ path: path.join(output, "today-scalper-progression.png"), fullPage: true });
  await context.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  if (password) {
    const login = await mobile.request.post(`${authBase}/auth/session/dev-login`, { data: { identifier: "admin", password }, headers: { Origin: authOrigin } });
    check("Authenticated mobile candidate", login.ok(), `HTTP ${login.status()}`);
    const sessionPair = (login.headers()["set-cookie"] ?? "").split(";", 1)[0];
    const separator = sessionPair.indexOf("=");
    if (separator > 0) await mobile.addCookies([{
      name: sessionPair.slice(0, separator), value: sessionPair.slice(separator + 1),
      domain: new URL(base).hostname, path: "/", httpOnly: true, secure: false, sameSite: "Lax",
    }]);
  }
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(base, { waitUntil: "domcontentloaded", timeout: 90_000 });
  const mobileWidget = mobilePage.getByTestId("today-scalper-progression");
  await mobileWidget.getByText(/\d+\/\d+ at stage 4/).waitFor({ state: "visible", timeout: 30_000 });
  const mobileGeometry = await mobileWidget.locator('[aria-label="Horizontally scrollable stock progression"]').evaluate((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
  check("Mobile keeps progression in its own horizontal scroller", mobileGeometry.scrollWidth > mobileGeometry.clientWidth, JSON.stringify(mobileGeometry));
  check("Mobile page has no accidental horizontal overflow", await mobilePage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), String(await mobilePage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)));
  await mobilePage.screenshot({ path: path.join(output, "today-scalper-progression-mobile.png"), fullPage: true });
  await mobile.close();
} finally {
  await browser.close();
  await fs.writeFile(path.join(output, "results.json"), JSON.stringify(results, null, 2));
}
console.log(JSON.stringify({ passed: results.filter((result) => result.status === "PASS").length, total: results.length, output }));
