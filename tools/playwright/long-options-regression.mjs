import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = (process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:19090/n50").replace(/\/$/, "");
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
const outputDir = path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR ?? "output/playwright/long-options");
if (!password) throw new Error("PLAYWRIGHT_ADMIN_PASSWORD is required");

await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];

function check(viewport, name, passed, detail = "") {
  results.push({ viewport, name, passed, detail });
  if (!passed) throw new Error(`${viewport} ${name}: ${detail}`);
}

try {
  for (const viewport of [
    { name: "desktop-1920x1080", width: 1920, height: 1080 },
    { name: "mobile-390x844", width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
    const login = await context.request.post(`${baseUrl}/auth/session/dev-login`, {
      data: { identifier: "admin", password },
    });
    check(viewport.name, "authenticated login", login.ok(), `status=${login.status()}`);

    const page = await context.newPage();
    const errors = [];
    page.on("console", (message) => {
      if (message.type() === "error" && !/cloudflareinsights|clarity/i.test(message.text())) errors.push(message.text());
    });
    await page.goto(`${baseUrl}/strategy/long-options`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.getByRole("heading", { name: "Long-Only Options Router", exact: true }).waitFor();

    const payload = await page.evaluate(async (url) => {
      const response = await fetch(url, { credentials: "include" });
      return { status: response.status, body: await response.json() };
    }, `${baseUrl}/v1/long-options/summary`);
    check(viewport.name, "summary API", payload.status === 200, `status=${payload.status}`);
    check(viewport.name, "independent strategy identity", payload.body.strategyFamily === "LONG_ONLY_OPTIONS_ROUTER", String(payload.body.strategyFamily));
    check(viewport.name, "paper-only safety", payload.body.environment === "PAPER" && payload.body.liveOrdersEnabled === false, JSON.stringify({ environment: payload.body.environment, live: payload.body.liveOrdersEnabled }));
    check(viewport.name, "real option structures", payload.body.summary?.evaluatedStructures > 0, JSON.stringify(payload.body.summary));
    check(viewport.name, "straddle and strangle paper routes", payload.body.summary?.straddleState === "PAPER" && payload.body.summary?.strangleState === "PAPER", JSON.stringify(payload.body.summary));
    check(viewport.name, "directional routes disabled", payload.body.summary?.callPutPromotionState === "SHADOW_DISABLED_PENDING_DIRECTION_VALIDATION", String(payload.body.summary?.callPutPromotionState));
    check(viewport.name, "no live action", await page.getByRole("button", { name: /place order|submit order|execute trade|add paper trade/i }).count() === 0, "unexpected order action rendered");
    check(viewport.name, "router evidence", await page.getByRole("heading", { name: "Four routes, one safe default" }).count() === 1, "router section missing");
    check(viewport.name, "candidate table", await page.locator("tbody tr").count() === payload.body.summary.evaluatedStructures, `rows=${await page.locator("tbody tr").count()}`);
    check(viewport.name, "no horizontal overflow", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `scrollWidth=${await page.evaluate(() => document.documentElement.scrollWidth)}`);
    check(viewport.name, "console clean", errors.length === 0, errors.join(" | "));

    if (viewport.width > 720) {
      const strategyLink = page.getByRole("navigation", { name: "Workspace navigation" }).getByRole("link", { name: /Strategy/ }).first();
      await strategyLink.hover();
      const menu = page.getByRole("menu", { name: "Strategy dashboards" });
      await menu.waitFor();
      check(viewport.name, "Long Options strategy menu entry", await menu.getByText("Long Options", { exact: true }).count() === 1, "menu entry missing");
    }

    await page.screenshot({ path: path.join(outputDir, `${viewport.name}.png`), fullPage: true });
    await context.close();
  }
} finally {
  await browser.close();
  await fs.writeFile(path.join(outputDir, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
}

console.log(JSON.stringify({ checks: results.length, passed: results.filter((result) => result.passed).length, outputDir }, null, 2));
