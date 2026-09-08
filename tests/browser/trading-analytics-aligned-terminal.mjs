import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "../../.audit-playwright/node_modules/playwright/index.mjs";

const origin = (process.env.ALIGNED_TERMINAL_ORIGIN ?? "http://127.0.0.1:5175").replace(/\/$/, "");
const authBase = (process.env.ALIGNED_TERMINAL_AUTH_BASE ?? "http://127.0.0.1:19090/n50").replace(/\/$/, "");
const output = path.resolve(process.env.ALIGNED_TERMINAL_OUTPUT ?? "output/ui-validation/aligned-terminal-v3");
let password = process.env.DEV_LOCAL_AUTH_PASSWORD;
if (!password) {
  const contents = await fs.readFile(process.env.ALIGNED_TERMINAL_ENV ?? ".env", "utf8");
  password = contents.split(/\r?\n/).find((line) => line.startsWith("DEV_LOCAL_AUTH_PASSWORD="))?.split("=").slice(1).join("=").trim();
}
if (!password) throw new Error("DEV_LOCAL_AUTH_PASSWORD is required");
await fs.mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true });
const results = [];
for (const viewport of [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
]) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const login = await context.request.post(`${authBase}/auth/session/dev-login`, { data: { identifier: "admin", password } });
  if (!login.ok()) throw new Error(`Login failed: ${login.status()}`);
  // The production gateway correctly issues a Secure /n50 cookie. For the
  // loopback-only Vite validation origin, copy the same opaque session cookie
  // without exposing its value and relax only its transport/path attributes.
  const gatewayCookies = await context.cookies();
  await context.addCookies(gatewayCookies.map((cookie) => ({
    ...cookie,
    domain: "127.0.0.1",
    path: "/",
    secure: false,
  })));
  const localSession = await context.request.get(`${origin}/auth/session`);
  if (!localSession.ok()) throw new Error(`Local proxied session failed: ${localSession.status()}`);
  const sessionState = await localSession.json();
  if (!sessionState?.user) throw new Error(`Local proxied session is unauthenticated: ${JSON.stringify(Object.keys(sessionState ?? {}))}`);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  const started = performance.now();
  await page.goto(`${origin}/n50/strategy/trading-analytics?view=scalper&interval=5`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  try {
    await page.getByTestId("aligned-scalper-terminal").waitFor({ state: "visible", timeout: 20_000 });
  } catch (error) {
    await page.screenshot({ path: path.join(output, `aligned-terminal-failure-${viewport.width}x${viewport.height}.png`), fullPage: false });
    const body = (await page.locator("body").innerText()).slice(0, 2_000);
    throw new Error(`${error}\nBrowser errors:\n${errors.join("\n")}\nVisible body:\n${body}`);
  }
  await page.waitForTimeout(1500);
  const facts = await page.evaluate(() => {
    const terminal = document.querySelector('[data-testid="aligned-scalper-terminal"]');
    const rect = terminal?.getBoundingClientRect();
    return {
      renderer: document.querySelector('[aria-label="Scalper renderer"]')?.value,
      canvases: terminal?.querySelectorAll("canvas").length ?? 0,
      terminalWidth: rect?.width ?? 0,
      terminalHeight: rect?.height ?? 0,
      hasHorizontalPageOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
      text: terminal?.textContent ?? "",
    };
  });
  if (facts.renderer !== "aligned") throw new Error("Aligned terminal is not the default renderer");
  if (facts.canvases < 7) throw new Error(`Expected multi-pane canvases, observed ${facts.canvases}`);
  if (facts.hasHorizontalPageOverflow) throw new Error(`Page overflows horizontally at ${viewport.width}px`);
  for (const label of ["SELECTED PAIR", "OUTSTANDING OI", "SIGNED INTERVAL ΔOI", "RSI 14", "MACD 12/26/9", "A → B MEASUREMENT"]) {
    if (!facts.text.includes(label)) throw new Error(`Missing terminal evidence label: ${label}`);
  }
  await page.getByRole("button", { name: "Fix pair for measurement" }).click();
  const start = page.getByLabel("Measurement start time");
  const end = page.getByLabel("Measurement end time");
  await start.selectOption({ index: 1 });
  const endOptions = await end.locator("option").count();
  await end.selectOption({ index: endOptions - 1 });
  await page.waitForTimeout(200);
  const measurement = await page.evaluate(() => ({
    status: document.querySelector('[aria-label="Browser-only position measurement"] [role="status"]')?.textContent ?? "",
    boxes: document.querySelector('[data-testid="aligned-measurement-boxes"]')?.children.length ?? 0,
    boxStyles: [...(document.querySelector('[data-testid="aligned-measurement-boxes"]')?.children ?? [])].map((element) => element.getAttribute("style")),
  }));
  if (!measurement.status.includes("A measures the selected candle open; B measures the selected candle close")) {
    throw new Error("Measurement semantics do not state A open and B close");
  }
  if (measurement.boxes < 1) throw new Error("Expected a price-coordinate A/B measurement rectangle");
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  const screenshot = `aligned-terminal-${viewport.width}x${viewport.height}.png`;
  await page.screenshot({ path: path.join(output, screenshot), fullPage: false });
  results.push({ viewport, screenshot, durationMs: Math.round(performance.now() - started), errors, measurement, ...facts });
  await context.close();
}
await browser.close();
await fs.writeFile(path.join(output, "validation.json"), `${JSON.stringify({ origin, capturedAt: new Date().toISOString(), results }, null, 2)}\n`);
if (results.some((result) => result.errors.length)) throw new Error(JSON.stringify(results.flatMap((result) => result.errors)));
console.log(JSON.stringify({ output, cases: results.length, passed: results.length }));
