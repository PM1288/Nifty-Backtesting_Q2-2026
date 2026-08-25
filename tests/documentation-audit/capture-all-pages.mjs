#!/usr/bin/env node
/** Authenticated, read-only route and screenshot audit for docs/trading-app-audit. */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const requireFromPlaywrightTools = createRequire(path.join(repoRoot, "tools/playwright/package.json"));
const { chromium } = requireFromPlaywrightTools("playwright");
const docsRoot = path.join(repoRoot, "docs/trading-app-audit");
const origin = (process.env.PLAYWRIGHT_ORIGIN ?? "http://127.0.0.1:19090").replace(/\/$/, "");
const basePath = process.env.PLAYWRIGHT_BASE_PATH ?? "/n50";

async function passwordFromEnvironment() {
  if (process.env.PLAYWRIGHT_ADMIN_PASSWORD) return process.env.PLAYWRIGHT_ADMIN_PASSWORD;
  const envFile = process.env.PLAYWRIGHT_ADMIN_PASSWORD_FILE;
  if (!envFile) return null;
  const raw = await fs.readFile(envFile, "utf8");
  const line = raw.split(/\r?\n/).find((entry) => entry.startsWith("DEV_LOCAL_AUTH_PASSWORD="));
  if (!line) return null;
  const value = line.slice(line.indexOf("=") + 1).trim();
  return value.replace(/^(["'])(.*)\1$/, "$2");
}

const password = await passwordFromEnvironment();
if (!password) throw new Error("Provide PLAYWRIGHT_ADMIN_PASSWORD or PLAYWRIGHT_ADMIN_PASSWORD_FILE containing DEV_LOCAL_AUTH_PASSWORD");

const routeMap = JSON.parse(await fs.readFile(path.join(docsRoot, "evidence/route-map.json"), "utf8"));
const routeFilter = process.env.PLAYWRIGHT_ROUTE_FILTER ? new RegExp(process.env.PLAYWRIGHT_ROUTE_FILTER) : null;
const resolveRoute = (route) => route
  .replace(":symbol", "RELIANCE")
  .replace(":slug", "rsi")
  .replace(":strategyId", "macd_bullcross_above50dma_rsi55to70_tp400_sl300_max20");
const canonical = routeMap
  .filter((item) => !item.redirect && item.route !== "*" && !item.route.includes("/*"))
  .filter((item) => !routeFilter || routeFilter.test(item.route))
  .map((item) => ({ ...item, captureRoute: resolveRoute(item.route) }));

const viewports = [
  { name: "1920x1080", folder: "desktop", width: 1920, height: 1080, detail: true },
  { name: "1440x900", folder: "desktop", width: 1440, height: 900, detail: false },
  { name: "1024x768", folder: "tablet", width: 1024, height: 768, detail: false },
  { name: "390x844", folder: "mobile", width: 390, height: 844, detail: false },
];
const slugify = (value) => value.toLowerCase().replace(/:[a-zA-Z0-9_]+/g, "param").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "home";
const browser = await chromium.launch({ headless: true });
const priorRuntime = routeFilter ? JSON.parse(await fs.readFile(path.join(docsRoot, "evidence/runtime-audit.json"), "utf8").catch(() => "[]")) : [];
const priorScreenshots = routeFilter ? JSON.parse(await fs.readFile(path.join(docsRoot, "evidence/screenshot-map.json"), "utf8").catch(() => "[]")) : [];
const replacedRoutes = new Set(canonical.map((item) => item.route));
const runtime = priorRuntime.filter((item) => !replacedRoutes.has(item.routePattern));
const screenshots = priorScreenshots.filter((item) => !replacedRoutes.has(item.page));

async function captureViewport(viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    colorScheme: "light",
    reducedMotion: "reduce",
    locale: "en-IN",
    timezoneId: "Asia/Kolkata",
  });
  const login = await context.request.post(`${origin}${basePath}/auth/session/dev-login`, {
    data: { identifier: "admin", password },
  });
  if (!login.ok()) throw new Error(`${viewport.name} authorised dev login failed with HTTP ${login.status()}`);
  const page = await context.newPage();
  await page.addStyleTag({ content: "*,*::before,*::after{animation-duration:0.001ms!important;animation-delay:0ms!important;transition-duration:0.001ms!important;caret-color:transparent!important}" }).catch(() => {});

  for (const item of canonical) {
    const slug = slugify(item.route);
    const failedRequests = [];
    const responseErrors = [];
    const apiResponses = [];
    const consoleErrors = [];
    const onRequestFailed = (request) => failedRequests.push({ url: request.url(), failure: request.failure()?.errorText ?? "unknown" });
    const onResponse = (response) => {
      if (/\/(?:n50\/)?(?:v1|api|auth)\//.test(response.url())) {
        apiResponses.push({ status: response.status(), method: response.request().method(), url: response.url() });
        if (response.status() >= 400) responseErrors.push({ status: response.status(), url: response.url() });
      }
    };
    const onConsole = (message) => { if (message.type() === "error") consoleErrors.push(message.text()); };
    page.on("requestfailed", onRequestFailed);
    page.on("response", onResponse);
    page.on("console", onConsole);
    const started = Date.now();
    let navigationStatus = null;
    let navigationError = null;
    try {
      const response = await page.goto(`${origin}${basePath}${item.captureRoute}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
      navigationStatus = response?.status() ?? null;
      await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
      await page.waitForTimeout(1_000);
    } catch (error) {
      navigationError = error instanceof Error ? error.message : String(error);
    }
    const facts = await page.evaluate(() => ({
      title: document.title,
      finalPath: `${location.pathname}${location.search}`,
      headings: [...document.querySelectorAll("h1,h2,h3")].slice(0, 80).map((node) => (node.textContent ?? "").trim()).filter(Boolean),
      bodyTextPrefix: (document.body.innerText ?? "").slice(0, 600),
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 2,
      tables: document.querySelectorAll("table").length,
      canvases: document.querySelectorAll("canvas").length,
      svgs: document.querySelectorAll("svg").length,
      dialogs: document.querySelectorAll('[role="dialog"]').length,
    })).catch(() => ({ title: "UNVERIFIED", finalPath: "", headings: [], bodyTextPrefix: "", documentWidth: null, viewportWidth: viewport.width, horizontalOverflow: null, tables: 0, canvases: 0, svgs: 0, dialogs: 0 }));

    const screenshotPath = path.join(docsRoot, "screenshots", viewport.folder, `${slug}__${viewport.name}__full.png`);
    let screenshotError = null;
    try {
      await page.screenshot({ path: screenshotPath, fullPage: true, animations: "disabled", timeout: 90_000 });
      screenshots.push({ filename: path.relative(docsRoot, screenshotPath).replaceAll(path.sep, "/"), page: item.route, capturedRoute: item.captureRoute, viewport: viewport.name, section: "full page", components: [item.component], purpose: "Authenticated current-UI baseline" });
    } catch (error) { screenshotError = error instanceof Error ? error.message : String(error); }

    if (viewport.detail) {
      const detailTargets = [
        { selector: "main h1", kind: "sections", label: "top" },
        { selector: "main table", kind: "sections", label: "table" },
        { selector: "main canvas", kind: "charts", label: "chart" },
        { selector: "main figure", kind: "charts", label: "figure" },
      ];
      for (const target of detailTargets) {
        const locators = page.locator(target.selector);
        const count = Math.min(await locators.count(), target.kind === "charts" ? 8 : 2);
        for (let index = 0; index < count; index += 1) {
          const locator = locators.nth(index);
          if (!await locator.isVisible().catch(() => false)) continue;
          const element = target.kind === "charts" && target.selector.endsWith("canvas") ? locator.locator("xpath=..") : locator;
          const detailPath = path.join(docsRoot, "screenshots", target.kind, `${slug}__${target.label}-${index + 1}.png`);
          await element.screenshot({ path: detailPath, animations: "disabled", timeout: 30_000 }).then(() => {
            screenshots.push({ filename: path.relative(docsRoot, detailPath).replaceAll(path.sep, "/"), page: item.route, capturedRoute: item.captureRoute, viewport: viewport.name, section: `${target.label} ${index + 1}`, components: [item.component], purpose: "Component-level documentation evidence" });
          }).catch(() => {});
        }
      }
      if (item.route === "/") {
        const tile = page.locator("main button, main a").filter({ hasText: /RELIANCE|HDFC|ICICI|INFY/ }).first();
        if (await tile.isVisible().catch(() => false)) {
          await tile.hover().catch(() => {});
          const hoverPath = path.join(docsRoot, "screenshots/hover-states", `${slug}__stock-tile-hover.png`);
          await page.screenshot({ path: hoverPath, fullPage: false, animations: "disabled" }).then(() => screenshots.push({ filename: path.relative(docsRoot, hoverPath).replaceAll(path.sep, "/"), page: item.route, capturedRoute: item.captureRoute, viewport: viewport.name, section: "stock hover", components: [item.component], purpose: "Hover-state evidence" })).catch(() => {});
        }
      }
    }

    const renderedDegradedState = item.route === "/paper-trading" && /taking longer than expected|Loading durable PAPER observations/i.test(facts.bodyTextPrefix ?? "");
    runtime.push({
      routePattern: item.route, captureRoute: item.captureRoute, component: item.component, viewport: viewport.name,
      navigationStatus, navigationError, screenshotError, elapsedMs: Date.now() - started, ...facts,
      failedRequests, responseErrors, consoleErrors,
      apiResponses: [...new Map(apiResponses.map((entry) => [`${entry.method} ${entry.url}`, entry])).values()],
      result: navigationError || screenshotError || (navigationStatus != null && navigationStatus >= 400) ? "FAIL" : responseErrors.length || renderedDegradedState ? "DEGRADED" : "CAPTURED",
    });
    page.off("requestfailed", onRequestFailed);
    page.off("response", onResponse);
    page.off("console", onConsole);
  }
  await context.close();
}

try {
  await Promise.all(viewports.map(captureViewport));

  if (!routeFilter) {
    // Safe authentication-required state; no bypass and no state-changing action.
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light" });
    const page = await context.newPage();
    await page.goto(`${origin}${basePath}/paper-trading`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(1_000);
    const authPath = path.join(docsRoot, "screenshots/errors/paper-trading__auth-required.png");
    await page.screenshot({ path: authPath, fullPage: true, animations: "disabled" });
    screenshots.push({ filename: path.relative(docsRoot, authPath).replaceAll(path.sep, "/"), page: "/paper-trading", capturedRoute: "/paper-trading", viewport: "1440x900", section: "authentication required", components: ["AuthGateModal", "PaperTradingCommandCenter"], purpose: "Safe unauthenticated error-state evidence" });
    await context.close();
  }
} finally {
  await browser.close();
}

runtime.sort((a, b) => a.routePattern.localeCompare(b.routePattern) || a.viewport.localeCompare(b.viewport));
screenshots.sort((a, b) => a.filename.localeCompare(b.filename));
await fs.writeFile(path.join(docsRoot, "evidence/runtime-audit.json"), `${JSON.stringify(runtime, null, 2)}\n`);
await fs.writeFile(path.join(docsRoot, "evidence/screenshot-map.json"), `${JSON.stringify(screenshots, null, 2)}\n`);

const counts = {
  routes: canonical.length,
  captures: runtime.length,
  screenshots: screenshots.length,
  captured: runtime.filter((row) => row.result === "CAPTURED").length,
  degraded: runtime.filter((row) => row.result === "DEGRADED").length,
  failed: runtime.filter((row) => row.result === "FAIL").length,
  responseErrors: runtime.reduce((sum, row) => sum + row.responseErrors.length, 0),
  consoleErrors: runtime.reduce((sum, row) => sum + row.consoleErrors.length, 0),
  horizontalOverflow: runtime.filter((row) => row.horizontalOverflow).length,
};
await fs.writeFile(path.join(docsRoot, "evidence/playwright-summary.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), origin, basePath, ...counts }, null, 2)}\n`);
console.log(JSON.stringify(counts, null, 2));
if (counts.failed) process.exitCode = 1;
