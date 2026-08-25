import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const origin = (process.env.PLAYWRIGHT_ORIGIN ?? "http://127.0.0.1:19090").replace(/\/$/, "");
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
const outputDir = path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR ?? "output/playwright/paper-auth-bootstrap-20260818");
if (!password) throw new Error("PLAYWRIGHT_ADMIN_PASSWORD is required.");

await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
const check = (name, passed, detail = "") => {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}: ${detail}`);
};

try {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const login = await context.request.post(`${origin}/auth/session/dev-login`, {
    data: { identifier: "admin", password },
  });
  check("admin login", login.ok(), `status=${login.status()}`);

  const page = await context.newPage();
  let sessionResolved = false;
  let earlyPaperRequests = 0;
  const paperResponses = [];

  await page.route("**/n50/auth/session", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    await route.continue();
  });
  page.on("response", (response) => {
    if (response.url().endsWith("/n50/auth/session")) sessionResolved = true;
    if (response.url().includes("/n50/v1/workspace/paper-trading")) {
      paperResponses.push(response.status());
    }
  });
  page.on("request", (request) => {
    if (request.url().endsWith("/n50/v1/workspace/paper-trading") && !sessionResolved) {
      earlyPaperRequests += 1;
    }
  });

  await page.goto(`${origin}/n50/paper-trading?prefetch=off`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.getByRole("heading", { name: "Paper Trading", exact: true }).waitFor({ timeout: 90_000 });
  check("paper request waits for session bootstrap", earlyPaperRequests === 0, `earlyRequests=${earlyPaperRequests}`);
  check("paper endpoint succeeds", paperResponses.length === 1 && paperResponses[0] === 200, JSON.stringify(paperResponses));
  check("no persistent 401 state", await page.getByText("Paper evaluation unavailable", { exact: true }).count() === 0, "error state rendered");
  await page.screenshot({ path: path.join(outputDir, "paper-auth-bootstrap-1366x768.png") });
  await context.close();
} finally {
  await browser.close();
  await fs.writeFile(path.join(outputDir, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
}

console.log(JSON.stringify({ checks: results.length, passed: results.filter((item) => item.passed).length, outputDir }, null, 2));
