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
  const consoleErrors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("requestfailed", (request) => consoleErrors.push(`${request.url()}: ${request.failure()?.errorText ?? "request failed"}`));
  await page.goto(base, { waitUntil: "domcontentloaded", timeout: 90_000 });
  const widget = page.getByTestId("today-scalper-progression");
  await widget.waitFor({ state: "visible", timeout: 30_000 }).catch(async () => {
    throw new Error(`Today progression did not mount: ${JSON.stringify({ url: page.url(), body: (await page.locator("body").innerText()).slice(0, 2_000), errors, consoleErrors })}`);
  });
  await widget.getByText(/\d+\/\d+ fully qualified/).waitFor({ state: "visible", timeout: 30_000 });
  const text = await widget.innerText();
  check("Progression table is above Risk and Anomaly", await widget.evaluate((element) => {
    const risk = [...document.querySelectorAll("strong")].find((node) => node.textContent === "RISK & ANOMALY SNAPSHOT");
    return risk ? Boolean(element.compareDocumentPosition(risk) & Node.DOCUMENT_POSITION_FOLLOWING) : false;
  }), text.slice(0, 500));
  const rows = widget.locator("tbody [data-progression-symbol]");
  const rowCount = await rows.count();
  const symbols = await rows.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-progression-symbol")));
  check("Exactly one visual row represents each stock", rowCount >= 20 && new Set(symbols).size === rowCount, `${rowCount} stock rows / ${new Set(symbols).size} unique`);
  check("Both alternative monthly routes are visible in grouped headers", await widget.getByRole("columnheader", { name: "M−1 CLOSE" }).count() === 1 && await widget.getByRole("columnheader", { name: "M−1 + M−2 SUFFICIENCY" }).count() === 1, "M−1 route and cumulative M−1 + M−2 sufficiency route inspected");
  check("Each route exposes seven additive checkpoints", ["M", "W0", "W−1", "D0", "1H", "15m", "5m"].every((label) => text.includes(label)), text.slice(0, 800));
  check("Observed pass and fail conditions use explicit semantic states", await widget.locator('td[data-state="pass"]').count() > 0 && await widget.locator('td[data-state="fail"]').count() > 0, "Observed state cells inspected; pending semantics are covered by unit fixtures");
  const qualifiedCount = Number((text.match(/^(\d+)\/\d+ fully qualified/m) ?? [])[1] ?? 0);
  check("Fully qualified stocks sort first when present", qualifiedCount === 0 || await rows.first().getAttribute("data-qualified") === "true", `qualified=${qualifiedCount}`);
  const stockStates = await rows.evaluateAll((nodes) => nodes.map((node) => ({
    qualified: node.getAttribute("data-qualified"),
    stockState: node.getAttribute("data-stock-state"),
  })));
  check("Stock cell turns green only for a complete M-1 or M-2 route", stockStates.every((row) => (row.stockState === "complete") === (row.qualified === "true")), JSON.stringify(stockStates.slice(0, 12)));
  const scroller = widget.locator('[aria-label="Horizontally scrollable progression matrix"]');
  const geometry = await scroller.evaluate((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth, clientHeight: element.clientHeight, scrollHeight: element.scrollHeight }));
  const firstRowHeight = await rows.first().evaluate((element) => element.getBoundingClientRect().height);
  check("Compact stock rows stay within 32-36px", firstRowHeight >= 32 && firstRowHeight <= 36, `height=${firstRowHeight}`);
  check("The matrix is not fixed-height or vertically clipped", geometry.scrollHeight <= geometry.clientHeight + 1 && geometry.clientHeight >= Math.min(rowCount, 20) * 32, JSON.stringify(geometry));
  check("Horizontal overflow is contained inside the matrix", geometry.scrollWidth > geometry.clientWidth && await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), JSON.stringify(geometry));
  await rows.first().click();
  check("Row opens complete arithmetic drawer", await page.getByRole("dialog", { name: /progression evidence/ }).isVisible() && await page.getByText(/Evaluation timestamp/).count() === 1, "Progression evidence drawer and timestamp inspected");
  await page.keyboard.press("Escape");
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
  await mobileWidget.getByText(/\d+\/\d+ fully qualified/).waitFor({ state: "visible", timeout: 30_000 });
  const mobileGeometry = await mobileWidget.locator('[aria-label="Horizontally scrollable progression matrix"]').evaluate((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth, clientHeight: element.clientHeight, scrollHeight: element.scrollHeight }));
  check("Mobile contains wide columns in the matrix scroller", mobileGeometry.scrollWidth > mobileGeometry.clientWidth, JSON.stringify(mobileGeometry));
  check("Mobile does not vertically clip stock rows", mobileGeometry.scrollHeight <= mobileGeometry.clientHeight + 1, JSON.stringify(mobileGeometry));
  check("Mobile page has no accidental horizontal overflow", await mobilePage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), String(await mobilePage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)));
  await mobilePage.screenshot({ path: path.join(output, "today-scalper-progression-mobile.png"), fullPage: true });
  await mobile.close();
} finally {
  await browser.close();
  await fs.writeFile(path.join(output, "results.json"), JSON.stringify(results, null, 2));
}
console.log(JSON.stringify({ passed: results.filter((result) => result.status === "PASS").length, total: results.length, output }));
