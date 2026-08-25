import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const appBase = (process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:19090/n50").replace(/\/$/, "");
const outputDir = path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR ?? "output/playwright/app-version-regression");
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const results = [];
function check(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}: ${detail}`);
}

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const targetUrl = `${appBase}/paper-trading?tab=simple&period=30D`;
  await page.goto(targetUrl, { waitUntil: "networkidle", timeout: 90_000 });

  const currentResponse = await context.request.get(`${appBase}/app-version.json?t=baseline`);
  check("version endpoint available", currentResponse.ok(), `status=${currentResponse.status()}`);
  check("version endpoint no-store", /no-store/i.test(currentResponse.headers()["cache-control"] ?? ""), currentResponse.headers()["cache-control"]);
  const current = await currentResponse.json();
  check("version fingerprint valid", /^index-[^/]+\.js$/i.test(String(current.version ?? "")), JSON.stringify(current));

  const forcedVersion = "index-forced-regression.js";
  let versionChecks = 0;
  await page.route("**/app-version.json**", async (route) => {
    versionChecks += 1;
    await route.fulfill({ status: 200, contentType: "application/json", headers: { "Cache-Control": "no-store" }, body: JSON.stringify({ version: forcedVersion }) });
  });
  const reload = page.waitForEvent("framenavigated", { predicate: (frame) => frame === page.mainFrame(), timeout: 15_000 });
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await reload;
  await page.waitForLoadState("domcontentloaded");
  check("mismatch forces reload", versionChecks >= 1, `checks=${versionChecks}`);
  check("route and filters preserved", page.url().includes("/paper-trading?tab=simple&period=30D"), page.url());
  await page.waitForTimeout(750);
  check("reload loop prevented", versionChecks <= 2, `checks=${versionChecks}`);
  await page.screenshot({ path: path.join(outputDir, "post-version-reload.png"), fullPage: false });
  await context.close();
} finally {
  await browser.close();
  await fs.writeFile(path.join(outputDir, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
}

console.log(JSON.stringify({ checks: results.length, passed: results.filter((item) => item.passed).length, outputDir }, null, 2));
