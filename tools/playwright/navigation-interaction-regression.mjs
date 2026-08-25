import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = (process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:19090/n50").replace(/\/$/, "");
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
if (!password) throw new Error("PLAYWRIGHT_ADMIN_PASSWORD is required");
const outputDir = path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR ?? "output/playwright/navigation-interaction");
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const auth = await browser.newContext();
const response = await auth.request.post(`${baseUrl}/auth/session/dev-login`, { data: { identifier: "admin", password } });
if (!response.ok()) throw new Error(`login failed: ${response.status()}`);
const storageState = await auth.storageState();
await auth.close();

const results = [];
const check = (viewport, name, passed, detail = "") => results.push({ viewport, name, passed, detail });

try {
  for (const viewport of [
    { name: "desktop-1920x1080", width: 1920, height: 1080 },
    { name: "tablet-768x1024", width: 768, height: 1024 },
    { name: "mobile-390x844", width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({ viewport, storageState, reducedMotion: "reduce" });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on("console", (event) => { if (event.type() === "error" && !/clarity|cloudflareinsights/i.test(event.text())) consoleErrors.push(event.text()); });
    await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    const mobile = viewport.width <= 720;
    const navigation = page.getByRole("navigation", { name: mobile ? "Mobile workspace navigation" : "Workspace navigation", exact: true });
    await navigation.waitFor({ timeout: 30_000 });

    check(viewport.name, "no sidebar", await page.locator("#primary-site-sidebar").count() === 0);
    check(viewport.name, "no horizontal body overflow", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    if (!mobile) {
      check(viewport.name, "seven primary workspaces", await navigation.getByRole("link").count() === 7);
      check(viewport.name, "workspace subtitles removed", await navigation.locator("small").count() === 0);
    }

    const launcher = page.getByRole("button", { name: "Search stocks, dashboards and actions" });
    await launcher.focus();
    await page.keyboard.press("Control+K");
    const palette = page.getByRole("dialog", { name: "Search stocks, dashboards & actions" });
    await palette.waitFor();
    const input = palette.getByRole("combobox");
    await input.fill("@RELIANCE");
    await page.waitForTimeout(250);
    check(viewport.name, "stock prefix finds real instrument", await palette.getByRole("option", { name: /RELIANCE/ }).count() >= 1);
    await page.keyboard.press("Escape");
    check(viewport.name, "escape restores command focus", await launcher.evaluate((element) => element === document.activeElement));

    await page.keyboard.press("Shift+?");
    const guide = page.getByRole("dialog", { name: "Keyboard shortcuts" });
    await guide.waitFor();
    check(viewport.name, "shortcut guide discoverable", await guide.getByText("Go to Paper Trading", { exact: true }).count() === 1);
    await page.keyboard.press("Escape");

    if (mobile) {
      const more = page.getByRole("button", { name: "More", exact: true });
      await more.click();
      const sheet = page.getByRole("dialog", { name: "More workspaces" });
      await sheet.waitFor();
      check(viewport.name, "secondary strategy remains discoverable", await sheet.getByRole("link", { name: /Rolling Monthly/ }).count() === 1);
      await page.keyboard.press("Escape");
    } else {
      await page.goto(`${baseUrl}/paper-trading`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.getByRole("heading", { name: "Paper Trading" }).waitFor({ timeout: 30_000 });
      await page.locator("body").click({ position: { x: 2, y: 2 } });
      await page.keyboard.press("a");
      const paperDialog = page.getByRole("heading", { name: "Add analytical paper trade" });
      await paperDialog.waitFor();
      check(viewport.name, "paper shortcut opens preview only", await page.getByText("It cannot place a broker order.", { exact: false }).count() >= 1);
      await page.keyboard.press("Escape");
    }

    await page.screenshot({ path: path.join(outputDir, `${viewport.name}.png`), fullPage: false });
    check(viewport.name, "no relevant console errors", consoleErrors.length === 0, consoleErrors.join(" | "));
    await context.close();
  }
} finally {
  await browser.close();
}

await fs.writeFile(path.join(outputDir, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ total: results.length, passed: results.length - failed.length, failed: failed.length, outputDir }, null, 2));
if (failed.length) { console.error(JSON.stringify(failed, null, 2)); process.exitCode = 1; }
