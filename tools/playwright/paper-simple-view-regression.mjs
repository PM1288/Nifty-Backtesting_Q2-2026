import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const appBase = (process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:19090/n50").replace(/\/$/, "");
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
const outputDir = path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR ?? "output/playwright/paper-simple-view");
if (!password) throw new Error("PLAYWRIGHT_ADMIN_PASSWORD is required.");

await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
function check(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}: ${detail}`);
}

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const login = await context.request.post(`${appBase}/auth/session/dev-login`, {
    data: { identifier: "admin", password },
    headers: { Origin: new URL(appBase).origin },
  });
  check("admin login", login.ok(), `status=${login.status()}`);

  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  const response = await page.goto(`${appBase}/paper-trading?tab=simple&prefetch=off`, { waitUntil: "networkidle", timeout: 90_000 });
  check("route response", Boolean(response?.ok()), `status=${response?.status()}`);
  await page.getByRole("heading", { name: "Entry-day price and current P/L", exact: true }).waitFor();
  check("simple tab active", await page.getByRole("button", { name: "Simple view", exact: true }).getAttribute("data-active") === "true");

  const headers = await page.locator("table thead").innerText();
  for (const label of ["STOCK NAME", "DATE BOUGHT AT", "TIME BOUGHT AT", "ENTRY STRIKE PRICE", "O FACTOR", "X FACTOR", "MAX PRICE · P/L", "LOW · MAX DRAWDOWN", "CURRENT PRICE · P/L"]) {
    check(`column ${label}`, headers.toUpperCase().includes(label), headers);
  }
  const rows = page.locator("table tbody tr");
  check("table populated", await rows.count() > 0, "no paper rows rendered");
  check("default newest sort", await page.getByLabel("Sort simple paper trades").inputValue() === "NEWEST");
  check("contained table scroll", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), "viewport has horizontal overflow");

  await rows.first().click();
  const drawer = page.locator('aside[aria-label$=" paper trade detail"]');
  await drawer.waitFor();
  check("canonical trade inspector", await drawer.getByRole("button", { name: "Journey", exact: true }).count() === 1);
  await page.keyboard.press("Escape");
  await drawer.waitFor({ state: "detached" });

  for (const [button, extension] of [["Download CSV", ".csv"], ["Download Excel", ".xls"]]) {
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: button, exact: true }).click();
    const download = await downloadPromise;
    check(`${extension} export`, download.suggestedFilename().endsWith(extension), download.suggestedFilename());
    await download.saveAs(path.join(outputDir, download.suggestedFilename()));
  }

  await page.screenshot({ path: path.join(outputDir, "paper-simple-view-1440x900.png"), fullPage: true });
  check("page errors clean", errors.length === 0, errors.join(" | "));
  await context.close();
} finally {
  await browser.close();
  await fs.writeFile(path.join(outputDir, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
}

console.log(JSON.stringify({ checks: results.length, passed: results.filter((item) => item.passed).length, outputDir }, null, 2));
