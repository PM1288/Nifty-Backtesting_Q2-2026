import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = (process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:19090/n50").replace(/\/$/, "");
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
const outputDir = path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR ?? "output/playwright/uxs3-regression");
if (!password) throw new Error("PLAYWRIGHT_ADMIN_PASSWORD is required.");

await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];

function record(name, passed, detail) {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}: ${detail}`);
}

try {
  for (const viewport of [{ name: "mobile", width: 430, height: 932 }, { name: "desktop", width: 1440, height: 1000 }]) {
    const context = await browser.newContext({ viewport });
    const login = await context.request.post(`${baseUrl}/auth/session/dev-login`, { data: { identifier: "admin", password } });
    record(`${viewport.name} login`, login.ok(), `status=${login.status()}`);
    const page = await context.newPage();
    const consoleErrors = [];
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });

    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle", timeout: 60_000 });
    record(`${viewport.name} protected home launcher`, await page.getByRole("button", { name: /Find/i }).count() === 0, "command launcher must not change home layout");
    record(`${viewport.name} home overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "home has horizontal overflow");

    await page.goto(`${baseUrl}/backtesting/lab`, { waitUntil: "networkidle", timeout: 60_000 });
    await page.getByRole("navigation", { name: "Research to paper workflow" }).waitFor();
    record(`${viewport.name} workflow stages`, await page.getByRole("navigation", { name: "Research to paper workflow" }).getByRole("link").count() === 5, "expected five workflow stages");
    record(`${viewport.name} result currency state`, await page.getByText("Result vs inputs", { exact: true }).count() === 1, "missing result currency status");
    record(`${viewport.name} lab overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "lab has horizontal overflow");

    await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K");
    const dialog = page.getByRole("dialog", { name: "Navigate the NIFTY 50 Trader workspace" });
    await dialog.waitFor();
    await dialog.getByPlaceholder("Find a page, workflow, or stock").fill("paper");
    record(`${viewport.name} command search`, await dialog.getByRole("option").count() > 0, "paper route not searchable");
    await page.keyboard.press("Escape");
    record(`${viewport.name} command escape`, await dialog.count() === 0, "command palette did not close");

    if (await page.getByRole("tab", { name: "Inputs & audit" }).count()) {
      await page.getByRole("tab", { name: "Inputs & audit" }).click();
      await page.getByText("Run inputs and provenance", { exact: true }).waitFor();
      record(`${viewport.name} provenance`, true, "run provenance visible");
    }
    await page.screenshot({ path: path.join(outputDir, `${viewport.name}-strategy-lab.png`), fullPage: true });

    await page.goto(`${baseUrl}/paper-trading`, { waitUntil: "networkidle", timeout: 60_000 });
    record(`${viewport.name} paper identity`, await page.getByText("PAPER", { exact: true }).count() > 0, "paper environment missing");
    record(`${viewport.name} paper execution`, await page.getByText("Recent paper trade groups", { exact: true }).count() === 1, "paper trade groups missing");
    record(`${viewport.name} paper overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "paper page has horizontal overflow");
    await page.screenshot({ path: path.join(outputDir, `${viewport.name}-paper-trading.png`), fullPage: true });

    record(`${viewport.name} console`, consoleErrors.length === 0, consoleErrors.join(" | "));
    await context.close();
  }
} finally {
  await browser.close();
  await fs.writeFile(path.join(outputDir, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
}

console.log(JSON.stringify({ checks: results.length, passed: results.filter((item) => item.passed).length }, null, 2));
