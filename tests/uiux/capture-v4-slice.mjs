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
const basePath = "/n50";
const envFile = process.env.PLAYWRIGHT_ADMIN_PASSWORD_FILE;
if (!envFile) throw new Error("PLAYWRIGHT_ADMIN_PASSWORD_FILE is required");
const raw = await fs.readFile(envFile, "utf8");
const entry = raw.split(/\r?\n/).find((line) => line.startsWith("DEV_LOCAL_AUTH_PASSWORD="));
if (!entry) throw new Error("DEV_LOCAL_AUTH_PASSWORD is absent from the provided environment file");
const password = entry.slice(entry.indexOf("=") + 1).trim().replace(/^(["'])(.*)\1$/, "$2");
const routes = process.env.PLAYWRIGHT_ROUTES
  ? process.env.PLAYWRIGHT_ROUTES.split(",").map((route) => route.trim()).filter(Boolean)
  : ["/", "/paper-trading", "/strategy/long-options", "/strategy/nifty-options"];
const viewports = [{ name: "1440x900", width: 1440, height: 900 }, { name: "390x844", width: 390, height: 844 }];
const output = path.join(root, "docs/uiux/screenshots/phase-b-d-slice");
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport, colorScheme: "light", reducedMotion: "reduce", locale: "en-IN", timezoneId: "Asia/Kolkata" });
    // Vite proxies the root /auth path to the gateway's /n50/auth path. Logging
    // in through the same origin guarantees the browser receives the host/path
    // cookie used by AuthGateProvider.
    const login = await context.request.post(`${origin}/auth/session/dev-login`, { data: { identifier: "admin", password } });
    if (!login.ok()) throw new Error(`Authorised dev login failed with HTTP ${login.status()}`);
    const session = await context.request.get(`${origin}/auth/session`);
    if (!session.ok()) throw new Error(`Authorised session verification failed with HTTP ${session.status()}`);
    const page = await context.newPage();
    await page.goto(`${origin}${basePath}/`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    const authDialog = page.locator('[role="dialog"]');
    if (await authDialog.isVisible().catch(() => false)) {
      const inputs = authDialog.locator("input");
      await inputs.nth(0).fill("admin");
      await inputs.nth(1).fill(password);
      await authDialog.getByRole("button", { name: "Log in", exact: true }).last().click();
      await authDialog.waitFor({ state: "hidden", timeout: 20_000 });
    }
    for (const route of routes) {
      const responses = [];
      const onResponse = (response) => { if (response.status() >= 400 && /\/(?:v1|api|auth)\//.test(response.url())) responses.push({ status: response.status(), url: response.url() }); };
      page.on("response", onResponse);
      const started = Date.now();
      const response = await page.goto(`${origin}${basePath}${route}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
      await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
      await page.waitForSelector("main h1, [role=dialog]", { timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(2_000);
      const slug = route === "/" ? "home" : route.slice(1).replaceAll("/", "-");
      const file = `${slug}__${viewport.name}.png`;
      await page.screenshot({ path: path.join(output, file), fullPage: true, animations: "disabled", timeout: 90_000 });
      const layout = await page.evaluate(() => ({
        height: document.documentElement.scrollHeight,
        width: document.documentElement.scrollWidth,
        viewportWidth: innerWidth,
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 2,
        canvases: document.querySelectorAll("canvas").length,
        tables: document.querySelectorAll("table").length,
        h1: [...document.querySelectorAll("h1")].map((node) => node.textContent?.trim()).filter(Boolean),
        bodyTextPrefix: (document.body.innerText ?? "").slice(0, 240),
      }));
      results.push({ route, viewport: viewport.name, status: response?.status() ?? null, elapsedMs: Date.now() - started, responseErrors: responses, screenshot: `docs/uiux/screenshots/phase-b-d-slice/${file}`, ...layout });
      page.off("response", onResponse);
    }
    await context.close();
  }
} finally {
  await browser.close();
}
await fs.writeFile(path.join(output, "results.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), origin, results }, null, 2)}\n`);
const failures = results.filter((item) => item.status !== 200 || item.horizontalOverflow || item.responseErrors.length);
console.log(JSON.stringify({ captures: results.length, failures: failures.length, results }, null, 2));
if (failures.length) process.exitCode = 1;
