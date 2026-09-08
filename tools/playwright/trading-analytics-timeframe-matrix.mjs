import fs from "node:fs/promises";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright";

const base = (process.env.PLAYWRIGHT_BASE_URL ?? "https://n50.nifty50today.co.in/n50").replace(/\/$/, "");
const output = path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR ?? "/home/novius2/NIFTY50/UI/MANEESH_MULTI_TIMEFRAME_MATRIX_ACCEPTANCE_20260908");
let password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
if (!password) {
  const env = await fs.readFile(process.env.PLAYWRIGHT_ENV_FILE ?? "/home/novius2/trading-stack/.env", "utf8");
  password = env.split(/\r?\n/).find((line) => line.startsWith("DEV_LOCAL_AUTH_PASSWORD="))?.split("=").slice(1).join("=").trim();
}
if (!password) throw new Error("Protected browser-test password is unavailable");
await fs.mkdir(output, { recursive: true });

const checks = [];
const failures = [];
const check = (name, pass, detail = null) => {
  checks.push({ name, pass: Boolean(pass), detail });
  if (!pass) failures.push(`${name}${detail ? `: ${detail}` : ""}`);
};
const knownNoise = (text) =>
  text.includes("clarity.ms/collect") ||
  text.includes("static.cloudflareinsights.com/beacon.min.js") ||
  text === "Failed to load resource: net::ERR_NETWORK_CHANGED";
const navigate = async (page, url) => {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
      return;
    } catch (error) {
      lastError = error;
      if (!String(error).includes("ERR_NETWORK_CHANGED")) throw error;
      await page.waitForTimeout(1_000);
    }
  }
  throw lastError;
};
const browser = await chromium.launch({ headless: true });

try {
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 1440, height: 900 }]) {
    const tag = `${viewport.width}x${viewport.height}`;
    const runtimeErrors = [];
    const context = await browser.newContext({ viewport, reducedMotion: "reduce", extraHTTPHeaders: { "Cache-Control": "no-cache" } });
    const login = await context.request.post(`${base}/auth/session/dev-login`, {
      data: { identifier: "admin", password },
      headers: { Origin: new URL(base).origin },
    });
    check(`${tag} authenticated`, login.ok(), `HTTP ${login.status()}`);
    const page = await context.newPage();
    page.on("pageerror", (error) => runtimeErrors.push(String(error)));
    page.on("console", (message) => {
      if (message.type() === "error" && !knownNoise(message.text())) runtimeErrors.push(message.text());
    });
    await navigate(page, `${base}/strategy/trading-analytics?view=matrix`);
    const matrix = page.getByTestId("multi-timeframe-matrix");
    await matrix.waitFor({ state: "visible", timeout: 60_000 });
    // The first response may intentionally redirect from an empty current-chain
    // pair to the nearest retained exact pair. Wait for that second, heavier
    // three-interval request rather than validating its transient loading shell.
    await page.waitForFunction(() => {
      const cells = [...document.querySelectorAll("[data-matrix-chart]")];
      return cells.length === 9 && cells.every((cell) => {
        const text = cell.textContent ?? "";
        return !text.includes("No completed retained candles") && !text.includes("O —");
      });
    }, undefined, { timeout: 90_000 });
    await page.waitForTimeout(1_000);

    check(`${tag} has exactly nine chart cells`, await matrix.locator("[data-matrix-chart]").count() === 9);
    check(`${tag} has underlying column`, await matrix.getByText(/Underlying/, { exact: false }).count() > 0);
    check(`${tag} has selected CE column`, await matrix.getByText("Selected CE", { exact: true }).count() === 1);
    check(`${tag} has selected PE column`, await matrix.getByText("Selected PE", { exact: true }).count() === 1);
    for (const interval of [1, 5, 15]) {
      check(`${tag} ${interval}m row has all three identities`, await matrix.locator(`[data-matrix-chart^="${interval}-"]`).count() === 3);
    }
    check(`${tag} matrix exposes no interval selector`, await matrix.getByRole("combobox", { name: /^Interval/ }).count() === 0);
    check(`${tag} all nine charts mounted`, await matrix.locator("[data-matrix-chart] canvas").count() >= 9);

    const source = matrix.locator('[data-matrix-chart="1-UNDERLYING"]');
    await source.hover({ position: { x: 180, y: 90 } });
    await page.waitForTimeout(250);
    const cursor = await matrix.getAttribute("data-cursor-time");
    const synced = await matrix.locator("[data-matrix-chart]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-synced-time")));
    check(`${tag} hover emits a shared timestamp`, Boolean(cursor), cursor);
    check(`${tag} all nine panes receive the same cursor timestamp`, Boolean(cursor) && synced.every((value) => value === cursor), JSON.stringify(synced));

    const geometry = await matrix.evaluate((node) => {
      const box = node.getBoundingClientRect();
      const cells = [...node.querySelectorAll("[data-matrix-chart]")].map((cell) => cell.getBoundingClientRect());
      return {
        pageScrollHeight: document.documentElement.scrollHeight,
        viewportHeight: innerHeight,
        pageScrollWidth: document.documentElement.scrollWidth,
        viewportWidth: innerWidth,
        matrix: { top: box.top, bottom: box.bottom, width: box.width, height: box.height },
        minCellHeight: Math.min(...cells.map((cell) => cell.height)),
        maxCellBottom: Math.max(...cells.map((cell) => cell.bottom)),
      };
    });
    check(`${tag} uses one desktop viewport`, geometry.pageScrollHeight <= geometry.viewportHeight + 1, JSON.stringify(geometry));
    check(`${tag} has no browser horizontal overflow`, geometry.pageScrollWidth <= geometry.viewportWidth + 1, JSON.stringify(geometry));
    check(`${tag} all chart cells remain visible`, geometry.maxCellBottom <= viewport.height + 1 && geometry.minCellHeight >= 100, JSON.stringify(geometry));

    const axe = await new AxeBuilder({ page }).include("main").analyze();
    const serious = axe.violations.filter((item) => item.impact === "serious" || item.impact === "critical");
    check(`${tag} has no serious or critical accessibility violations`, serious.length === 0, serious.map((item) => item.id).join(", "));
    check(`${tag} has no application runtime errors`, runtimeErrors.length === 0, runtimeErrors.join(" | "));
    await fs.writeFile(path.join(output, `${tag}-axe.json`), JSON.stringify(axe.violations, null, 2));
    await page.screenshot({ path: path.join(output, `${tag}-matrix.png`), fullPage: true, animations: "disabled" });
    await context.close();
  }
} finally {
  await browser.close();
}

const report = { generatedAt: new Date().toISOString(), base, checks, failures };
await fs.writeFile(path.join(output, "acceptance.json"), JSON.stringify(report, null, 2));
if (failures.length) throw new Error(failures.join("\n"));
console.log(`PASS ${checks.length}/${checks.length} checks · ${output}`);
