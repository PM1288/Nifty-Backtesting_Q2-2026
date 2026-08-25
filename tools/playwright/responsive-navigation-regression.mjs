import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = (process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:19090/n50").replace(/\/$/, "");
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
const outputDir = path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR ?? "output/playwright/responsive-navigation");
if (!password) throw new Error("PLAYWRIGHT_ADMIN_PASSWORD is required.");

const viewports = [
  { name: "mobile-360x800", width: 360, height: 800 },
  { name: "mobile-390x844", width: 390, height: 844 },
  { name: "mobile-430x932", width: 430, height: 932 },
  { name: "mobile-boundary-720x900", width: 720, height: 900 },
  { name: "tablet-768x1024", width: 768, height: 1024 },
  { name: "tablet-1024x768", width: 1024, height: 768 },
  { name: "laptop-1280x720", width: 1280, height: 720 },
  { name: "desktop-1440x900", width: 1440, height: 900 },
  { name: "wide-1920x1080", width: 1920, height: 1080 }
];
const workspaceRoutes = [
  ["Today", "/"],
  ["Markets", "/analytics"],
  ["Stocks", "/analytics/stock/RELIANCE"],
  ["Strategy", "/strategy/oiis-live"],
  ["Paper Trading", "/paper-trading"],
  ["Derivatives", "/options/intelligence"],
  ["Data & Operations", "/analytics/system/quality"]
];

await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
const authContext = await browser.newContext();
await login(authContext);
const authenticatedState = await authContext.storageState();
await authContext.close();

function record(viewport, check, passed, detail = "") {
  results.push({ viewport: viewport.name, check, passed, detail });
}

async function login(context) {
  let lastStatus = 0;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const response = await context.request.post(`${baseUrl}/auth/session/dev-login`, {
      data: { identifier: "admin", password }
    });
    if (response.ok()) return;
    lastStatus = response.status();
    if ((lastStatus < 500 && lastStatus !== 429) || attempt === 6) break;
    await new Promise((resolve) => setTimeout(resolve, Math.min(5_000, attempt * 1_000)));
  }
  throw new Error(`Admin login failed after bounded retry: ${lastStatus}`);
}

async function assertBaseLayout(page, viewport) {
  const desktop = page.getByRole("navigation", { name: "Workspace navigation", exact: true });
  const mobile = page.getByRole("navigation", { name: "Mobile workspace navigation", exact: true });
  const isMobile = viewport.width <= 720;
  record(viewport, "legacy sidebar absent", await page.locator("#primary-site-sidebar").count() === 0);
  record(viewport, "correct responsive navigation", isMobile ? await mobile.isVisible() && !(await desktop.isVisible()) : await desktop.isVisible() && !(await mobile.isVisible()));
  record(viewport, "no document overflow", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  record(viewport, "main uses canvas", await page.evaluate(() => (document.querySelector("main")?.getBoundingClientRect().width ?? 0) >= window.innerWidth - Math.min(90, window.innerWidth * 0.12)));
  record(viewport, "sheet initially closed", await page.getByRole("dialog", { name: "More workspaces" }).count() === 0);
  if (isMobile) {
    const labels = await mobile.locator("a,button").allTextContents();
    record(viewport, "mobile dock has five destinations", labels.length === 5 && ["Today", "Markets", "Stocks", "Paper", "More"].every((label) => labels.some((value) => value.trim() === label)), labels.join(", "));
    record(viewport, "content clears fixed dock", await page.evaluate(() => Number.parseFloat(getComputedStyle(document.querySelector('[data-ui-generation="trading-v2"] main')?.parentElement?.parentElement ?? document.body).paddingBottom) >= 80));
  } else {
    record(viewport, "desktop dock has seven workspaces", await desktop.locator('a[data-workspace-primary="true"]').count() === 7);
  }
}

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport, storageState: authenticatedState });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        !/ERR_NETWORK_CHANGED|clarity|static\.cloudflareinsights\.com.*Content Security Policy/i.test(message.text())
      ) consoleErrors.push(message.text());
    });
    await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.getByRole("navigation", { name: viewport.width <= 720 ? "Mobile workspace navigation" : "Workspace navigation", exact: true }).waitFor({ timeout: 30_000 });
    await assertBaseLayout(page, viewport);
    await page.screenshot({ path: path.join(outputDir, `${viewport.name}-today.png`), fullPage: false });

    if ([390, 768, 1920].includes(viewport.width)) {
      for (const [label, route] of workspaceRoutes) {
        await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
        await page.getByRole("navigation", { name: viewport.width <= 720 ? "Mobile workspace navigation" : "Workspace navigation", exact: true }).waitFor({ timeout: 30_000 });
        const active = page.locator('nav a[aria-current="page"]');
        record(viewport, `${label} active route`, await active.filter({ hasText: label === "Paper Trading" && viewport.width <= 720 ? "Paper" : label }).count() >= 1, await active.allTextContents().then((values) => values.join(", ")));
        record(viewport, `${label} route fits`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
      }
    }

    if (viewport.width === 390) {
      await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.getByRole("navigation", { name: "Mobile workspace navigation", exact: true }).waitFor({ timeout: 30_000 });
      const more = page.getByRole("button", { name: "More", exact: true });
      await more.click();
      const sheet = page.getByRole("dialog", { name: "More workspaces" });
      await sheet.waitFor();
      record(viewport, "More locks body", await page.evaluate(() => document.body.style.overflow === "hidden"));
      record(viewport, "close receives focus", await sheet.getByRole("button", { name: "Close more workspaces" }).evaluate((element) => element === document.activeElement));
      await page.keyboard.press("Escape");
      record(viewport, "Escape closes and restores focus", await sheet.count() === 0 && await more.evaluate((element) => element === document.activeElement));

      for (let index = 0; index < 25; index += 1) {
        await more.click();
        await sheet.getByRole("button", { name: "Close more workspaces" }).click();
      }
      record(viewport, "repeated open close stable", await sheet.count() === 0 && await page.evaluate(() => document.body.style.overflow === ""));

      await more.click();
      await sheet.getByRole("link", { name: /OIIS Lab/ }).click();
      await page.waitForURL(/\/strategy\/oiis-live$/);
      record(viewport, "destination closes sheet", await sheet.count() === 0);
      const moreAfterRoute = page.getByRole("button", { name: "More", exact: true });
      record(viewport, "More marks secondary route", await moreAfterRoute.getAttribute("data-active") === "true");

      await moreAfterRoute.click();
      await sheet.getByRole("button", { name: /Commands/ }).click();
      const commands = page.getByRole("dialog", { name: "Search stocks, dashboards & actions" });
      await commands.waitFor();
      record(viewport, "commands open above navigation", await commands.isVisible());
      await page.keyboard.press("Escape");

      await moreAfterRoute.click();
      await sheet.getByRole("button", { name: /Presentation/ }).click();
      const exitPresentation = page.getByRole("button", { name: "Exit presentation" });
      record(viewport, "presentation hides dock", await exitPresentation.isVisible() && !(await page.getByRole("navigation", { name: "Mobile workspace navigation", exact: true }).isVisible()));
      await exitPresentation.click();

      await moreAfterRoute.click();
      await page.setViewportSize({ width: 1024, height: 768 });
      record(viewport, "resize closes sheet", await sheet.count() === 0 && await page.getByRole("navigation", { name: "Workspace navigation", exact: true }).isVisible());
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: path.join(outputDir, "mobile-390x844-more-sheet.png"), fullPage: false });
    }

    record(viewport, "no console errors", consoleErrors.length === 0, consoleErrors.join(" | "));
    await context.close();
  }
} finally {
  await browser.close();
}

await fs.writeFile(path.join(outputDir, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
const failures = results.filter((result) => !result.passed);
console.log(JSON.stringify({ checks: results.length, passed: results.length - failures.length, failed: failures.length, outputDir }, null, 2));
if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exitCode = 1;
}
