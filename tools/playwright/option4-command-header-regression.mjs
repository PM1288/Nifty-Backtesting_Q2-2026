import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = (process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:19090/n50").replace(/\/$/, "");
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
const outputDir = path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR ?? "output/playwright/option4-command-header");
if (!password) throw new Error("PLAYWRIGHT_ADMIN_PASSWORD is required.");

const viewports = [
  { name: "desktop-1920x1080", width: 1920, height: 1080 },
  { name: "desktop-1440x900", width: 1440, height: 900 },
  { name: "desktop-1280x720", width: 1280, height: 720 },
  { name: "tablet-1024x768", width: 1024, height: 768 },
  { name: "mobile-430x932", width: 430, height: 932 },
  { name: "mobile-390x844", width: 390, height: 844 },
  { name: "mobile-360x800", width: 360, height: 800 },
];

await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const loginContext = await browser.newContext();
const login = await loginContext.request.post(`${baseUrl}/auth/session/dev-login`, {
  data: { identifier: "admin", password },
  headers: { Origin: new URL(baseUrl).origin },
});
if (!login.ok()) throw new Error(`Admin login failed: ${login.status()}`);
const storageState = await loginContext.storageState();
await loginContext.close();

const results = [];
function check(viewport, name, passed, detail = "") {
  results.push({ viewport: viewport.name, name, passed, detail });
}

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport, storageState });
    const page = await context.newPage();
    const errors = [];
    page.on("console", (message) => { if (message.type() === "error" && !/clarity|cloudflareinsights/i.test(message.text())) errors.push(message.text()); });
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle", timeout: 90_000 });
    const appHeader = page.locator("header").first();
    await appHeader.waitFor();
    const height = await appHeader.evaluate((node) => node.getBoundingClientRect().height);
    const expectedHeight = viewport.width < 768 ? 84 : viewport.width < 1280 ? 52 : 56;
    check(viewport, "exact responsive header height", Math.abs(height - expectedHeight) <= 1, `actual=${height}, expected=${expectedHeight}`);
    check(viewport, "no page horizontal overflow", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    check(viewport, "no ticker rail", await page.locator('[aria-label="Market ticker tape"], [data-clarity-region="top_ticker"]').count() === 0);
    check(viewport, "NIFTY context retained", await page.getByTestId("nifty-header-quote").isVisible());
    if (viewport.width < 768) check(viewport, "mobile PAPER context retained", await appHeader.getByText("PAPER", { exact: true }).isVisible());
    check(viewport, "one global navigation implementation", await page.locator('nav[aria-label="Primary navigation"]').count() === 1);

    if (viewport.width >= 1280) {
      const primary = page.getByRole("navigation", { name: "Primary navigation" });
      check(viewport, "four primary destinations", await primary.locator(":scope > a, :scope > div > button").count() === 4);
      for (const label of ["Today", "Markets", "Strategy", /Paper/]) check(viewport, `primary ${String(label)}`, await primary.getByRole(label === "Markets" || label === "Strategy" ? "button" : "link", { name: label }).isVisible());

      await primary.getByRole("button", { name: /Markets/ }).click();
      const markets = page.getByRole("menu", { name: "Markets" });
      check(viewport, "Markets owns Stocks and Derivatives", await markets.getByRole("menuitem", { name: /Stocks/ }).isVisible() && await markets.getByRole("menuitem", { name: /Derivatives/ }).isVisible());
      await page.keyboard.press("Escape");

      await primary.getByRole("button", { name: /Strategy/ }).click();
      const strategy = page.getByRole("menu", { name: "Strategy workspaces" });
      check(viewport, "Strategy owns all seven workspaces", await strategy.getByRole("menuitem").count() === 8);
      const stack = await strategy.evaluate((menu) => {
        const rect = menu.getBoundingClientRect();
        return [
          [rect.left + 12, rect.top + 12],
          [rect.left + rect.width / 2, rect.top + rect.height / 2],
          [rect.right - 12, rect.bottom - 12],
        ].every(([x, y]) => { const top = document.elementFromPoint(x, y); return Boolean(top && (top === menu || menu.contains(top))); });
      });
      check(viewport, "dropdown above frozen content", stack);
      await page.keyboard.press("Escape");

      await page.getByRole("button", { name: "More navigation" }).click();
      const more = page.getByRole("menu", { name: "More navigation" });
      check(viewport, "More owns Data and Operations", await more.getByRole("menuitem", { name: /Data & Operations/ }).isVisible());
      check(viewport, "More excludes Stocks and Derivatives", await more.getByText(/^Stocks$/).count() === 0 && await more.getByText(/^Derivatives$/).count() === 0);
      await page.keyboard.press("Escape");
    } else {
      check(viewport, "desktop navigation hidden", !(await page.getByRole("navigation", { name: "Primary navigation" }).isVisible()));
      const trigger = page.getByRole("button", { name: "Open navigation" });
      await trigger.click();
      const drawer = page.getByRole("dialog", { name: "Application navigation" });
      check(viewport, "responsive drawer opens", await drawer.isVisible());
      check(viewport, "drawer locks body", await page.evaluate(() => document.body.style.overflow === "hidden"));
      for (const label of ["Today", "Markets", "Strategy", "Paper Trading", "More"]) check(viewport, `drawer ${label}`, await drawer.getByText(label, { exact: true }).first().isVisible());
      await page.keyboard.press("Escape");
      check(viewport, "Escape closes drawer and restores focus", await drawer.count() === 0 && await trigger.evaluate((node) => node === document.activeElement));
    }

    await page.keyboard.press("Control+k");
    const commandPalette = page.locator('[role="dialog"][aria-labelledby="command-palette-title"]');
    await commandPalette.waitFor({ state: "visible" });
    check(viewport, "Ctrl K command palette retained", await commandPalette.isVisible());
    await commandPalette.getByRole("button", { name: "Close search and commands" }).click();
    await commandPalette.waitFor({ state: "detached" });
    check(viewport, "no console errors", errors.length === 0, errors.join(" | "));
    await page.screenshot({ path: path.join(outputDir, `${viewport.name}.png`), fullPage: false });
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
