import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const origin = (process.env.PLAYWRIGHT_ORIGIN ?? "http://127.0.0.1:19090").replace(/\/$/, "");
const appBase = `${origin}/n50`;
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
const outputDir = path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR ?? "output/playwright/oiss-v1-202608");
if (!password) throw new Error("PLAYWRIGHT_ADMIN_PASSWORD is required.");

await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const checks = [];
function check(name, passed, detail = "") {
  checks.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}: ${detail}`);
}

try {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const login = await context.request.post(`${origin}/auth/session/dev-login`, { data: { identifier: "admin", password } });
  check("admin login", login.ok(), `status=${login.status()}`);
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const failedResponses = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !/(clarity\.ms|cloudflareinsights\.com).*Content Security Policy/i.test(message.text())) consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  page.on("response", (response) => {
    if (response.status() >= 400 && /\/n50\/(v1|auth)\//.test(response.url())) failedResponses.push(`${response.status()} ${response.url()}`);
  });

  const response = await page.goto(`${appBase}/strategy/oiss-v1-202608/now?prefetch=off`, { waitUntil: "networkidle", timeout: 60_000 });
  check("route response", Boolean(response?.ok()), `status=${response?.status()}`);
  await page.getByRole("heading", { name: "OISS v1.202608" }).waitFor();
  check("independent identity", await page.getByText("Independent strategy · intelligence/shadow", { exact: true }).count() === 1);
  check("radar populated", await page.locator("aside").filter({ hasText: "Stock radar" }).locator("button").count() >= 200);
  check("execution inspector", await page.getByRole("heading", { name: "Execution inspector" }).count() === 1);
  check("no viewport overflow", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
  await page.screenshot({ path: path.join(outputDir, "oiss-now-1920x1080.png"), fullPage: true });

  for (const lens of ["market", "sectors", "radar", "entry", "options", "carry", "rejected", "risk", "open positions", "changes", "backtest", "audit"]) {
    await page.getByRole("button", { name: lens, exact: true }).click();
    await page.waitForLoadState("networkidle");
    check(`lens ${lens}`, page.url().includes(lens.replace(" ", "-")), page.url());
  }
  check("31-section contract", await page.locator("ol li").count() === 31, `count=${await page.locator("ol li").count()}`);

  const runId = new URL(page.url()).searchParams.get("runId") ?? await page.locator('[aria-label="OISS run context"] div').first().locator("strong").innerText();
  const dashboard = await context.request.get(`${origin}/v1/oiss-v1/runs`);
  check("run history api", dashboard.ok(), `status=${dashboard.status()}`);
  const runPayload = await dashboard.json();
  const canonicalRunId = runPayload.runs[0].run_id;
  const excel = await context.request.get(`${origin}/v1/oiss-v1/export?runId=${canonicalRunId}&format=xlsx`);
  check("excel export", excel.ok() && /application\/vnd\.ms-excel/.test(excel.headers()["content-type"] ?? ""), `status=${excel.status()}`);
  const json = await context.request.get(`${origin}/v1/oiss-v1/export?runId=${canonicalRunId}&format=json`);
  check("json export", json.ok(), `status=${json.status()}`);
  check("console clean", consoleErrors.length === 0, consoleErrors.join(" | "));
  check("page errors clean", pageErrors.length === 0, pageErrors.join(" | "));
  check("api responses clean", failedResponses.length === 0, failedResponses.join(" | "));

  await fs.writeFile(path.join(outputDir, "results.json"), JSON.stringify({ generatedAt: new Date().toISOString(), checks }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, outputDir, runId }, null, 2));
} finally {
  await browser.close();
}
