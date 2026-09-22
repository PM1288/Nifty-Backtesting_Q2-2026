import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const base = (process.env.PLAYWRIGHT_BASE_URL ?? "https://n50.nifty50today.co.in/n50").replace(/\/$/, "");
const output = path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR ?? "/tmp/scalper-v3-compact-evaluation");
const env = await fs.readFile(process.env.PLAYWRIGHT_ENV_FILE ?? ".env", "utf8");
const rawPassword = process.env.PLAYWRIGHT_ADMIN_PASSWORD ?? env.split(/\r?\n/).find((line) => line.startsWith("DEV_LOCAL_AUTH_PASSWORD="))?.split("=").slice(1).join("=").trim();
const password = rawPassword?.replace(/^"|"$/g, "");
if (!password) throw new Error("Protected browser-test password is unavailable");
await fs.mkdir(output, { recursive: true });

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, status: pass ? "PASS" : "FAIL", detail });
  if (!pass) throw new Error(`${name}: ${detail}`);
};
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: "reduce" });
  const login = await context.request.post(`${base}/auth/session/dev-login`, { headers: { Origin: new URL(base).origin }, data: { identifier: "admin", password } });
  check("Authenticated production session", login.ok(), `HTTP ${login.status()}`);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(`${base}/strategy/trading-analytics?view=scalper_v3&interval=5`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  const terminal = page.getByTestId("scalper-v3");
  await terminal.waitFor({ state: "visible", timeout: 90_000 });
  await page.waitForTimeout(2_000);
  const geometry = await page.evaluate(() => {
    const rect = (selector) => { const node = document.querySelector(selector); if (!node) return null; const box = node.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height }; };
    const root = document.querySelector('[data-testid="scalper-v3"]');
    const panels = ["underlying", "call", "put"].map((id) => rect(`[data-testid="v2-chart-panel-${id}"]`));
    const rail = rect('[data-testid="scalper_v3-strike-side-charts"]');
    const bottom = rect('[data-testid="scalper_v3-oi-history-row"]');
    const visibleRefreshStamps = [...root.querySelectorAll('[class*="refreshStamp"]')].filter((node) => getComputedStyle(node).display !== "none").length;
    return { root: rect('[data-testid="scalper-v3"]'), panels, rail, bottom, visibleRefreshStamps };
  });
  const [underlying, call, put] = geometry.panels;
  const upperWidth = (underlying?.width ?? 0) + (call?.width ?? 0) + (geometry.rail?.width ?? 0);
  const shares = upperWidth ? [underlying.width / upperWidth, call.width / upperWidth, geometry.rail.width / upperWidth] : [];
  check("V3 uses the 41/37/22 compact column allocation", shares.length === 3 && Math.abs(shares[0] - .41) < .035 && Math.abs(shares[1] - .37) < .035 && Math.abs(shares[2] - .22) < .035, JSON.stringify(shares));
  check("CE and PE share pixel-identical horizontal geometry", Math.abs(call.x - put.x) <= 1 && Math.abs(call.width - put.width) <= 1, JSON.stringify({ call, put }));
  check("NIFTY spans the full upper height", Math.abs(underlying.height - (call.height + put.height + 4)) <= 4, JSON.stringify({ underlying, call, put }));
  check("Bottom strip uses the configured analytical height", geometry.bottom.height >= 170 && geometry.bottom.height <= 195, JSON.stringify(geometry.bottom));
  check("Repeated panel refresh stamps are suppressed", geometry.visibleRefreshStamps === 0, String(geometry.visibleRefreshStamps));
  check("Docked strike inspector is visible", await page.getByTestId("v3-strike-inspector").isVisible(), "shared inspector");
  check("No browser page errors", errors.length === 0, JSON.stringify(errors));
  await page.screenshot({ path: path.join(output, "desktop-1920-scalper-v3.png"), fullPage: true });

  await page.getByTestId("v2-chart-panel-underlying").dblclick({ position: { x: 320, y: 220 } });
  const maximized = await page.getByTestId("v2-chart-panel-underlying").boundingBox();
  check("Price pane double-click maximize and Escape restore", Boolean(maximized && maximized.width > 1800 && maximized.height > 1000), JSON.stringify(maximized));
  await page.keyboard.press("Escape");

  await page.getByText("Layout", { exact: true }).click();
  await page.getByRole("button", { name: "Collapse bottom strip" }).click();
  check("Bottom strip collapses to a restore control", await page.getByRole("button", { name: "Show time analytics" }).isVisible(), "collapsed");
  await page.getByRole("button", { name: "Show time analytics" }).click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await terminal.waitFor({ state: "visible", timeout: 90_000 });
  await page.waitForTimeout(1_000);
  await page.screenshot({ path: path.join(output, "desktop-1440-scalper-v3.png"), fullPage: true });
  check("Original V2 remains independently reachable", (await context.request.get(`${base}/strategy/trading-analytics?view=scalper_v2`)).ok(), "V2 route HTTP");
  await fs.writeFile(path.join(output, "results.json"), JSON.stringify({ results, geometry, shares, url: page.url() }, null, 2));
} finally {
  await browser.close();
}
console.log(JSON.stringify({ passed: results.filter((row) => row.status === "PASS").length, total: results.length, output }));
