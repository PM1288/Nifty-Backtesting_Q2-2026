import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = (process.env.PLAYWRIGHT_BASE_URL ?? "https://n50.nifty50today.co.in/n50").replace(/\/$/, "");
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
if (!password) throw new Error("PLAYWRIGHT_ADMIN_PASSWORD is required");
const outputDir = path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR ?? "output/playwright/paper-workbench-v2-accessibility");
await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 960, height: 540 }, reducedMotion: "reduce" });
  const login = await context.request.post(`${baseUrl}/auth/session/dev-login`, { data: { identifier: "admin", password } });
  if (!login.ok()) throw new Error(`admin login failed: ${login.status()}`);
  const page = await context.newPage();
  await page.goto(`${baseUrl}/paper-trading`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.getByRole("heading", { name: "Paper Trading Evidence Workbench" }).waitFor({ timeout: 120_000 });
  const structural = await page.evaluate(() => {
    const ids = [...document.querySelectorAll("[id]")].map((element) => element.id);
    const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
    const controls = [...document.querySelectorAll("button,input,select,textarea,a[href]")];
    const name = (element) => element.getAttribute("aria-label") || element.getAttribute("aria-labelledby") || element.textContent?.trim() || (element instanceof HTMLInputElement ? element.placeholder : "") || (element.id ? document.querySelector(`label[for=\"${CSS.escape(element.id)}\"]`)?.textContent?.trim() : "");
    const unnamedControls = controls.filter((element) => !name(element)).map((element) => element.outerHTML.slice(0, 160));
    const unnamedDialogs = [...document.querySelectorAll('[role="dialog"],dialog')].filter((element) => !name(element)).length;
    const positiveTabIndex = [...document.querySelectorAll("[tabindex]")].filter((element) => Number(element.getAttribute("tabindex")) > 0).length;
    return { duplicateIds, unnamedControls, unnamedDialogs, positiveTabIndex, h1Count: document.querySelectorAll("h1").length, reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches, bodyOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 };
  });
  if (structural.duplicateIds.length || structural.unnamedControls.length || structural.unnamedDialogs || structural.positiveTabIndex || structural.h1Count !== 1 || !structural.reducedMotion || structural.bodyOverflow) throw new Error(`structural accessibility failure: ${JSON.stringify(structural)}`);

  await page.getByRole("button", { name: /Trade Evidence/ }).click();
  const row = page.locator('div[class*="unifiedTable"] tbody tr').first();
  await row.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("complementary", { name: /paper trade detail/ }).waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("complementary", { name: /paper trade detail/ }).waitFor({ state: "detached" });
  const focusRestored = await page.evaluate(() => document.activeElement?.tagName ?? "NONE");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.getByRole("heading", { name: "Paper Trading Evidence Workbench" }).waitFor({ timeout: 120_000 });
  const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  if (mobileOverflow) throw new Error("390px mobile body overflow");
  await page.screenshot({ path: path.join(outputDir, "paper-workbench-v2-reduced-motion-390x844.png"), fullPage: true });
  const result = { status: "PASS", structural, keyboard: { rowEnterOpenedInspector: true, escapeClosedInspector: true, activeElementAfterClose: focusRestored }, mobile: { viewport: "390x844", bodyOverflow: false }, note: "960px layout is the 1920px desktop reflow-equivalent used for the automated 200% zoom pass." };
  await fs.writeFile(path.join(outputDir, "accessibility-results.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
