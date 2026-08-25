#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const requireFromTools = createRequire(path.join(root, "tools/playwright/package.json"));
const { chromium } = requireFromTools("playwright");
const origin = (process.env.PLAYWRIGHT_ORIGIN ?? "http://127.0.0.1:19100").replace(/\/$/, "");
const appPath = (process.env.PLAYWRIGHT_APP_PATH ?? "/n50").replace(/\/$/, "");
const passwordFile = process.env.PLAYWRIGHT_ADMIN_PASSWORD_FILE;
if (!passwordFile) throw new Error("PLAYWRIGHT_ADMIN_PASSWORD_FILE is required");

const rawEnv = await fs.readFile(passwordFile, "utf8");
const passwordLine = rawEnv.split(/\r?\n/).find((line) => line.startsWith("DEV_LOCAL_AUTH_PASSWORD="));
if (!passwordLine) throw new Error("DEV_LOCAL_AUTH_PASSWORD is absent from the provided environment file");
const password = passwordLine.slice(passwordLine.indexOf("=") + 1).trim().replace(/^(["'])(.*)\1$/, "$2");
const manifest = JSON.parse(await fs.readFile(path.join(root, "docs/uiux/route-visual-preservation-manifest.json"), "utf8"));
const routeForAudit = (route) => route
  .replace(":symbol", "RELIANCE")
  .replace(":slug", "rsi")
  .replace(":strategyId", "rsi30_willr80_closegtprev_tp125");
const routes = manifest.routes.map((entry) => ({ declared: entry.route, route: routeForAudit(entry.route) }));
const outputDir = path.join(root, "docs/uiux/runtime-audit");
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce", locale: "en-IN", timezoneId: "Asia/Kolkata" });
const login = await context.request.post(`${origin}/auth/session/dev-login`, { data: { identifier: "admin", password } });
if (!login.ok()) throw new Error(`Authorised dev login failed with HTTP ${login.status()}`);
const page = await context.newPage();
const results = [];
try {
  for (const item of routes) {
    const responseErrors = [];
    const consoleErrors = [];
    const onResponse = (response) => {
      if (response.status() >= 400 && /\/(?:v1|api|auth)\//.test(response.url())) responseErrors.push({ status: response.status(), url: response.url() });
    };
    const onConsole = (message) => {
      if (message.type() === "error" && !/clarity|cloudflareinsights|ERR_NETWORK_CHANGED/i.test(message.text())) consoleErrors.push(message.text());
    };
    page.on("response", onResponse);
    page.on("console", onConsole);
    const started = Date.now();
    let status = null;
    let navigationError = null;
    try {
      const response = await page.goto(`${origin}${appPath}${item.route}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      status = response?.status() ?? null;
      await page.locator("main").first().waitFor({ state: "visible", timeout: 15_000 });
      await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
      // Several authenticated analytical routes resolve durable PostgreSQL
      // evidence after the shell becomes idle. Give that state a bounded
      // opportunity to replace skeletons before classifying the route.
      await page.waitForFunction(() => {
        const main = document.querySelector("main");
        if (!main) return false;
        const text = (main.textContent ?? "").trim();
        const hasEvidence = Boolean(main.querySelector("canvas, table, [data-analytics-section], [data-paper-workbench-section]"));
        return text.length >= 40 && (hasEvidence || !/^(loading|preparing)/i.test(text));
      }, { timeout: 12_000 }).catch(() => {});
      await page.waitForTimeout(1_500);
    } catch (error) {
      navigationError = error instanceof Error ? error.message : String(error);
    }
    const layout = await page.evaluate(() => ({
      route: `${location.pathname}${location.search}`,
      height: document.documentElement.scrollHeight,
      width: document.documentElement.scrollWidth,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 2,
      headings: [...document.querySelectorAll("main h1")].map((node) => node.textContent?.trim()).filter(Boolean),
      tables: document.querySelectorAll("main table").length,
      canvases: document.querySelectorAll("main canvas").length,
      loading: /loading|preparing/i.test((document.querySelector("main")?.textContent ?? "").slice(0, 300)),
      textLength: (document.querySelector("main")?.textContent ?? "").trim().length,
    })).catch(() => ({ route: null, height: null, width: null, horizontalOverflow: null, headings: [], tables: 0, canvases: 0, loading: false, textLength: 0 }));
    results.push({ ...item, status, elapsedMs: Date.now() - started, navigationError, responseErrors, consoleErrors, ...layout });
    page.off("response", onResponse);
    page.off("console", onConsole);
    process.stdout.write(`${results.length}/${routes.length} ${item.route} ${status ?? "ERR"}\n`);
  }
} finally {
  await context.close();
  await browser.close();
}

const failures = results.filter((item) => item.status !== 200 || item.navigationError || item.horizontalOverflow || item.responseErrors.length || item.consoleErrors.length || item.loading || item.textLength < 20);
const report = {
  generatedAt: new Date().toISOString(),
  origin,
  appPath,
  viewport: "1440x900",
  summary: {
    routes: results.length,
    passed: results.length - failures.length,
    failed: failures.length,
    maxHeight: Math.max(...results.map((item) => item.height ?? 0)),
    routesOverTwoViewports: results.filter((item) => (item.height ?? 0) > 1800).length,
  },
  failures,
  results,
};
await fs.writeFile(path.join(outputDir, "canonical-routes-1440x900.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.summary, null, 2));
if (failures.length) process.exitCode = 1;
