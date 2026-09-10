import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const origin = (process.env.PLAYWRIGHT_ORIGIN ?? "http://127.0.0.1:19090").replace(/\/$/, "");
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
const outputDir = path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR ?? "/tmp/monthly-close-open-comparison");
if (!password) throw new Error("PLAYWRIGHT_ADMIN_PASSWORD is required");
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const results = [];
const check = (name, passed, detail = "") => {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}: ${detail}`);
};
const key = (row) => `${String(row.evaluation_month).slice(0, 10)}\u0000${row.symbol}`;

try {
  for (const viewport of [
    { name: "desktop-1440x900", width: 1440, height: 900 },
    { name: "mobile-390x844", width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({ viewport });
    const login = await context.request.post(`${origin}/n50/auth/session/dev-login`, {
      data: { identifier: "admin", password },
    });
    check(`${viewport.name} login`, login.ok(), `status=${login.status()}`);
    const page = await context.newPage();
    const failures = [];
    page.on("response", (response) => {
      if (response.status() >= 400 && /\/n50\/(v1|auth)\//.test(response.url())) {
        failures.push(`${response.status()} ${response.url()}`);
      }
    });
    await page.goto(`${origin}/n50/strategy/monthly?compare=close-open`, {
      waitUntil: "networkidle",
      timeout: 120_000,
    });
    await page.getByRole("heading", { name: "Stock-month overlap and differences" }).waitFor();
    check(`${viewport.name} Close tab`, await page.getByRole("link", { name: "Monthly Close", exact: true }).count() === 1);
    check(`${viewport.name} Open tab`, await page.getByRole("link", { name: "Monthly Open", exact: true }).count() === 1);
    check(`${viewport.name} comparison tab`, await page.getByRole("link", { name: "Close vs Open", exact: true }).count() === 1);

    const payloads = await page.evaluate(async () => {
      const [closeResponse, openResponse] = await Promise.all([
        fetch("/n50/v1/rolling-monthly/absolute-months?basis=close&includeEvaluations=false", { credentials: "include" }),
        fetch("/n50/v1/rolling-monthly/absolute-months?basis=open&includeEvaluations=false", { credentials: "include" }),
      ]);
      return {
        closeStatus: closeResponse.status,
        openStatus: openResponse.status,
        close: await closeResponse.json(),
        open: await openResponse.json(),
      };
    });
    check(`${viewport.name} both APIs`, payloads.closeStatus === 200 && payloads.openStatus === 200);
    check(`${viewport.name} Close version`, payloads.close.strategyVersion === "absolute_monthly_closure_bullish_long_v1");
    check(`${viewport.name} Open version`, payloads.open.strategyVersion === "absolute_monthly_open_bullish_long_v2");
    check(`${viewport.name} populated strategies`, payloads.close.candidates.length > 0 && payloads.open.candidates.length > 0);

    const closeKeys = new Set(payloads.close.candidates.map(key));
    const openKeys = new Set(payloads.open.candidates.map(key));
    const both = [...closeKeys].filter((value) => openKeys.has(value)).length;
    const closeOnly = [...closeKeys].filter((value) => !openKeys.has(value)).length;
    const openOnly = [...openKeys].filter((value) => !closeKeys.has(value)).length;
    check(`${viewport.name} comparison populations`, both > 0 && closeOnly > 0 && openOnly > 0, `both=${both}; closeOnly=${closeOnly}; openOnly=${openOnly}`);

    const summary = page.getByLabel("Monthly Close and Open comparison summary");
    check(`${viewport.name} both count`, (await summary.getByText("In both", { exact: true }).locator("..").innerText()).includes(String(both)));
    check(`${viewport.name} close-only count`, (await summary.getByText("Monthly Close only", { exact: true }).locator("..").innerText()).includes(String(closeOnly)));
    check(`${viewport.name} open-only count`, (await summary.getByText("Monthly Open only", { exact: true }).locator("..").innerText()).includes(String(openOnly)));

    const membership = page.locator("label", { hasText: "Selection overlap" }).locator("select");
    await membership.selectOption("BOTH");
    const table = page.getByLabel("Monthly Close versus Monthly Open comparison table");
    check(`${viewport.name} both rows`, await table.locator("tbody tr").count() === Math.min(both, 250));
    check(
      `${viewport.name} both labels`,
      await table.locator("tbody tr td:nth-child(3)").evaluateAll((cells) => cells.every((cell) => cell.textContent?.trim() === "In both")),
    );
    await membership.selectOption("ALL");

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download comparison CSV" }).click();
    const download = await downloadPromise;
    const downloadPath = await download.path();
    const csv = downloadPath ? await fs.readFile(downloadPath, "utf8") : "";
    check(`${viewport.name} CSV name`, download.suggestedFilename() === "monthly-close-vs-open-comparison.csv");
    check(`${viewport.name} CSV fields`, csv.includes("close_end_return_pct") && csv.includes("open_end_return_pct"));
    await page.getByRole("link", { name: "Monthly Close", exact: true }).click();
    await page.waitForURL(/entryMethod=MONTHLY_CLOSURE/);
    const method = page.locator("label", { hasText: "Entry method" }).locator("select");
    await method.waitFor();
    check(`${viewport.name} Close UI`, await method.inputValue() === "MONTHLY_CLOSURE");
    await page.getByRole("link", { name: "Monthly Open", exact: true }).click();
    await page.waitForURL(/entryMethod=MONTHLY_OPEN/);
    check(`${viewport.name} Open UI`, await method.inputValue() === "MONTHLY_OPEN");
    await page.getByRole("link", { name: "Close vs Open", exact: true }).click();
    await page.getByRole("heading", { name: "Stock-month overlap and differences" }).waitFor();
    check(`${viewport.name} no API failures`, failures.length === 0, failures.join(" | "));
    check(`${viewport.name} no page overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
    await page.screenshot({ path: path.join(outputDir, `${viewport.name}.png`), fullPage: true });
    await context.close();
  }
} finally {
  await browser.close();
  await fs.writeFile(path.join(outputDir, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
}

console.log(JSON.stringify({ checks: results.length, passed: results.filter((row) => row.passed).length, outputDir }, null, 2));
