import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const origin = (process.env.PLAYWRIGHT_ORIGIN ?? "http://127.0.0.1:19090").replace(/\/$/, "");
const password = process.env.DEV_LOCAL_AUTH_PASSWORD;
if (!password) throw new Error("DEV_LOCAL_AUTH_PASSWORD is required");
const outputDir = path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR ?? "output/playwright/options-intelligence");
await fs.mkdir(outputDir, { recursive: true });

const results = [];
function check(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}: ${detail}`);
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const login = await context.request.post(`${origin}/auth/session/dev-login`, { data: { identifier: "admin", password } });
  check("admin login", login.ok(), `status=${login.status()}`);
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const responseErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("ERR_NETWORK_CHANGED")) consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  page.on("response", (response) => {
    if (response.status() >= 400 && /\/n50\/v1\//.test(response.url())) responseErrors.push(`${response.status()} ${response.url()}`);
  });
  const response = await page.goto(`${origin}/n50/options/intelligence?prefetch=off`, { waitUntil: "networkidle", timeout: 60_000 });
  check("route response", Boolean(response?.ok()), `status=${response?.status()}`);
  await page.getByRole("heading", { name: "Options Intelligence", exact: true }).waitFor();
  check("paper identity", (await page.locator("body").innerText()).toLowerCase().includes("paper research only"), "paper boundary missing");
  check("full F&O funnel", await page.getByText("F&O universe", { exact: true }).count() === 1, "universe funnel missing");
  check("actual rankings", await page.locator("table tbody tr").count() >= 5, "expected live ranked rows");
  check("selected stock detail", await page.getByRole("heading", { name: "Decision anatomy", exact: true }).count() === 1, "detail panel missing");
  check("chain data", await page.getByRole("heading", { name: "Detailed current option chain", exact: true }).count() === 1, "chain table missing");
  check("provenance", await page.getByRole("heading", { name: "Data provenance", exact: true }).count() === 1, "provenance missing");
  check("desktop overflow", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), "document overflows horizontally");
  await page.screenshot({ path: path.join(outputDir, "options-intelligence-1920x1080.png") });
  await page.screenshot({ path: path.join(outputDir, "options-intelligence-full.png"), fullPage: true });
  check("console clean", consoleErrors.length === 0, consoleErrors.join(" | "));
  check("page errors clean", pageErrors.length === 0, pageErrors.join(" | "));
  check("API responses clean", responseErrors.length === 0, responseErrors.join(" | "));

  const tablet = await context.newPage();
  await tablet.setViewportSize({ width: 768, height: 1024 });
  await tablet.goto(`${origin}/n50/options/intelligence?prefetch=off`, { waitUntil: "networkidle", timeout: 60_000 });
  await tablet.getByRole("heading", { name: "Options Intelligence", exact: true }).waitFor();
  check("tablet overflow", await tablet.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), "768px document overflows");
  await tablet.screenshot({ path: path.join(outputDir, "options-intelligence-768x1024.png"), fullPage: true });
} finally {
  await browser.close();
  await fs.writeFile(path.join(outputDir, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
}

console.log(JSON.stringify({ checks: results.length, passed: results.filter((item) => item.passed).length, outputDir }, null, 2));
