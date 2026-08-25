import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.N50_BASE_URL || "http://127.0.0.1:19090";
const password = process.env.DEV_LOCAL_AUTH_PASSWORD;
if (!password) throw new Error("DEV_LOCAL_AUTH_PASSWORD is required");
const outputDir = path.resolve("tools/playwright/output/fno-volatility");
fs.mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1536, height: 1000 } });
  const login = await context.request.post(`${baseUrl}/auth/session/dev-login`, {
    data: { identifier: "admin", password },
  });
  if (!login.ok()) throw new Error(`admin login failed: ${login.status()}`);
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  const response = await page.goto(`${baseUrl}/n50/options/volatility-signals`, { waitUntil: "networkidle" });
  if (!response?.ok()) throw new Error(`route returned ${response?.status()}`);
  await page.getByRole("heading", { name: "F&O Straddle & Strangle Signals" }).waitFor();
  await page.getByText("186", { exact: true }).first().waitFor();
  const rows = await page.locator("tbody tr").count();
  if (rows < 15) throw new Error(`expected at least 15 visible data rows, found ${rows}`);
  const body = await page.locator("body").innerText();
  if (!body.includes("NO TRADE")) throw new Error("NO TRADE state is missing");
  await page.screenshot({ path: path.join(outputDir, "desktop.png"), fullPage: true });
  console.log(JSON.stringify({ status: "PASS", route: response.status(), rows, consoleErrors }, null, 2));
  if (consoleErrors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
