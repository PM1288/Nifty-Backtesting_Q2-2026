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
  await widget.getByText(/\d+ bull · \d+ bear · \d+ stocks/).waitFor({ state: "visible", timeout: 30_000 });
  const text = await widget.innerText();
  check("Progression table is above Risk and Anomaly", await widget.evaluate((element) => {
    const risk = [...document.querySelectorAll("strong")].find((node) => node.textContent === "RISK & ANOMALY SNAPSHOT");
    return risk ? Boolean(element.compareDocumentPosition(risk) & Node.DOCUMENT_POSITION_FOLLOWING) : false;
  }), text.slice(0, 500));
  const bullBoard = widget.getByRole("region", { name: "MWHD-BULL RANK" });
  const bearBoard = widget.getByRole("region", { name: "MWHD-BEAR RANK" });
  check("Independent Bull and Bear candidate boards are visible", await bullBoard.isVisible() && await bearBoard.isVisible(), text.slice(0, 500));
  const bullRows = bullBoard.locator("tbody [data-progression-symbol]");
  const bearRows = bearBoard.locator("tbody [data-progression-symbol]");
  const rowCount = await bullRows.count();
  const bullSymbols = await bullRows.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-progression-symbol")));
  const bearSymbols = await bearRows.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-progression-symbol")));
  check("Every stock has one Bull rank and one Bear rank", rowCount >= 20 && rowCount === bearSymbols.length && new Set(bullSymbols).size === rowCount && new Set(bearSymbols).size === rowCount && bullSymbols.every((symbol) => bearSymbols.includes(symbol)), `${rowCount} Bull / ${bearSymbols.length} Bear`);
  const expectedGateOrder = ["M−2", "M−1", "W0", "W−1", "D0", "1H", "15m", "5m"];
  const bullHeaders = await bullBoard.locator("thead th").allInnerTexts();
  const bearHeaders = await bearBoard.locator("thead th").allInnerTexts();
  check("Both boards expose the complete MWHD tick sequence with M−2 before M−1", expectedGateOrder.every((label, index) => bullHeaders[index + 3] === label && bearHeaders[index + 3] === label), JSON.stringify({ bullHeaders, bearHeaders }));
  check("Observed pass and fail conditions use explicit semantic states", await widget.locator('td[data-state="pass"]').count() > 0 && await widget.locator('td[data-state="fail"]').count() > 0, "Observed state cells inspected; pending semantics are covered by unit fixtures");
  const bullReady = Number((text.match(/^(\d+) bull/m) ?? [])[1] ?? 0);
  const bearReady = Number((text.match(/· (\d+) bear/m) ?? [])[1] ?? 0);
  check("Ready candidates sort first in their own direction", (bullReady === 0 || await bullRows.first().getAttribute("data-candidate") === "true") && (bearReady === 0 || await bearRows.first().getAttribute("data-candidate") === "true"), `bull=${bullReady}; bear=${bearReady}`);
  const visibleTableText = `${await bullBoard.innerText()}\n${await bearBoard.innerText()}`;
  check("Compact boards show ticks and scores without repeated market values", !visibleTableText.includes("₹") && /[✓×—]/.test(visibleTableText), visibleTableText.slice(0, 500));
  const scrollers = widget.locator('[class*="progressionRankScroller"]');
  const geometry = await scrollers.first().evaluate((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth, clientHeight: element.clientHeight, scrollHeight: element.scrollHeight }));
  const firstRowHeight = await bullRows.first().evaluate((element) => element.getBoundingClientRect().height);
  check("Dense candidate rows are no taller than 31px", firstRowHeight > 0 && firstRowHeight <= 31, `height=${firstRowHeight}`);
  const visibleBodyRows = (geometry.clientHeight - 23) / firstRowHeight;
  check("Only the top 15 ranks are visible before internal scrolling", visibleBodyRows >= 14.8 && visibleBodyRows <= 15.2 && geometry.scrollHeight > geometry.clientHeight, JSON.stringify({ ...geometry, firstRowHeight, visibleBodyRows }));
  check("Every stock identity has separate Bull and Bear rank tags", await bullRows.first().getByText(/BULL #\d+/).isVisible() && await bullRows.first().getByText(/BEAR #\d+/).isVisible() && await bearRows.first().getByText(/BULL #\d+/).isVisible() && await bearRows.first().getByText(/BEAR #\d+/).isVisible(), "Explicit direction tags inspected in both rankings");
  check("Bear rank column uses its own independently sorted rank", await bearRows.first().locator("td").first().innerText() === "#1", await bearRows.first().innerText());
  check("Horizontal overflow stays inside each half-width board", geometry.scrollWidth >= geometry.clientWidth && await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), JSON.stringify(geometry));
  await bullRows.first().click();
  const drawer = page.getByRole("dialog", { name: /MWHD evidence/ });
  check("Row drawer exposes Bull and Bear arithmetic and both ranks", await drawer.isVisible() && await drawer.getByText("MWHD-BULL arithmetic").isVisible() && await drawer.getByText("MWHD-BEAR arithmetic").isVisible() && await drawer.getByText(/Audited inverse logic/).isVisible(), "Dual-direction evidence inspected");
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
  await mobileWidget.getByText(/\d+ bull · \d+ bear · \d+ stocks/).waitFor({ state: "visible", timeout: 30_000 });
  const mobileGeometry = await mobileWidget.locator('[class*="progressionRankScroller"]').first().evaluate((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth, clientHeight: element.clientHeight, scrollHeight: element.scrollHeight }));
  check("Mobile contains wide columns in the matrix scroller", mobileGeometry.scrollWidth > mobileGeometry.clientWidth, JSON.stringify(mobileGeometry));
  check("Mobile retains the 15-row internal vertical scroller", mobileGeometry.scrollHeight > mobileGeometry.clientHeight && mobileGeometry.clientHeight <= 459, JSON.stringify(mobileGeometry));
  check("Mobile page has no accidental horizontal overflow", await mobilePage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), String(await mobilePage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)));
  await mobilePage.screenshot({ path: path.join(output, "today-scalper-progression-mobile.png"), fullPage: true });
  await mobile.close();
} finally {
  await browser.close();
  await fs.writeFile(path.join(output, "results.json"), JSON.stringify(results, null, 2));
}
console.log(JSON.stringify({ passed: results.filter((result) => result.status === "PASS").length, total: results.length, output }));
