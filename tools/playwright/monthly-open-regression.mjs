import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const origin = (process.env.PLAYWRIGHT_ORIGIN ?? "http://127.0.0.1:19090").replace(/\/$/, "");
const appBasePath = `/${(process.env.PLAYWRIGHT_APP_BASE_PATH ?? "n50").replace(/^\/+|\/+$/g, "")}`.replace(/^\/$/, "");
const authBase = (process.env.PLAYWRIGHT_AUTH_BASE_URL ?? `${origin}/n50`).replace(/\/$/, "");
const apiBase = (process.env.PLAYWRIGHT_API_BASE_URL ?? `${origin}/n50`).replace(/\/$/, "");
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
const outputDir = path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR ?? "/tmp/monthly-open-regression");
if (!password) throw new Error("PLAYWRIGHT_ADMIN_PASSWORD is required");
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const results = [];
const check = (name, passed, detail = "") => {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}: ${detail}`);
};

try {
  for (const viewport of [
    { name: "desktop-1440x900", width: 1440, height: 900 },
    { name: "mobile-390x844", width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({ viewport });
    const login = await context.request.post(`${authBase}/auth/session/dev-login`, {
      data: { identifier: "admin", password },
    });
    check(`${viewport.name} login`, login.ok(), `status=${login.status()}`);
    const page = await context.newPage();
    const failures = [];
    page.on("pageerror", (error) => failures.push(`pageerror ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") failures.push(`console ${message.text()}`);
    });
    page.on("response", (response) => {
      if (response.status() >= 400 && /\/(?:n50\/)?(?:v1|auth)\//.test(response.url())) {
        failures.push(`${response.status()} ${response.url()}`);
      }
    });
    await page.goto(`${origin}${appBasePath}/strategy/monthly?entryMethod=MONTHLY_OPEN`, {
      waitUntil: "networkidle",
      timeout: 120_000,
    });
    await page.getByRole("heading", { name: "Monthly Strategy", exact: true }).waitFor();
    check(`${viewport.name} Monthly Close tab`, await page.getByRole("link", { name: "Monthly Close", exact: true }).count() === 1);
    check(`${viewport.name} Monthly Open tab`, await page.getByRole("link", { name: "Monthly Open", exact: true }).count() === 1);
    const method = page.locator("label", { hasText: "Entry method" }).locator("select");
    const methodValues = await method.locator("option").evaluateAll((options) => options.map((option) => option.value));
    check(
      `${viewport.name} four methods`,
      ["ALL", "EXPIRY", "MONTHLY_CLOSURE", "MONTHLY_OPEN", "FIRST_SESSION"].every((value) => methodValues.includes(value)),
      `count=${methodValues.length}; values=${JSON.stringify(methodValues)}`,
    );
    check(`${viewport.name} Monthly Open selected`, await method.inputValue() === "MONTHLY_OPEN");
    const rows = page.locator("tbody tr");
    check(`${viewport.name} open rows`, await rows.count() > 0, "no Monthly Open rows");
    check(
      `${viewport.name} open labels only`,
      await rows.locator("td:nth-child(2) b").evaluateAll((nodes) => nodes.every((node) => node.textContent?.trim() === "Monthly Open")),
    );
    const api = await page.evaluate(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/v1/rolling-monthly/absolute-months?basis=open&includeEvaluations=false`, { credentials: "include" });
      return { status: response.status, body: await response.json() };
    }, apiBase);
    check(`${viewport.name} API`, api.status === 200, `status=${api.status}`);
    check(`${viewport.name} version`, api.body.strategyVersion === "absolute_monthly_open_bullish_long_v3");
    check(`${viewport.name} basis`, api.body.comparisonBasis === "OPEN");
    check(`${viewport.name} five eligibility conditions`, api.body.methodology.eligibility_condition_count === 5);
    check(`${viewport.name} previous-close gate disabled`, api.body.methodology.previous_session_close_gate === false);
    check(`${viewport.name} persisted candidates`, api.body.candidates.length > 0, `count=${api.body.candidates.length}`);
    await rows.first().click();
    const entryConditions = page.getByRole("heading", { name: "Entry conditions" }).locator("..").locator("li");
    await entryConditions.first().waitFor();
    check(`${viewport.name} five visible entry conditions`, await entryConditions.count() === 5);
    check(`${viewport.name} removed month-open crossover`, await page.getByText(/Previous-month open > two-month open/).count() === 0);
    check(`${viewport.name} previous month green candle retained`, await page.getByText(/Previous-month close > previous-month open/).count() > 0);
    check(`${viewport.name} removed close-gate evidence`, await page.getByText(/Signal open > previous-day close/).count() === 0);
    check(`${viewport.name} no API failures`, failures.length === 0, failures.join(" | "));
    check(`${viewport.name} no horizontal overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
    await page.screenshot({ path: path.join(outputDir, `${viewport.name}.png`), fullPage: true });
    await context.close();
  }
} finally {
  await browser.close();
  await fs.writeFile(path.join(outputDir, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
}

console.log(JSON.stringify({ checks: results.length, passed: results.filter((row) => row.passed).length, outputDir }, null, 2));
