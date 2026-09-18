import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const base = (process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:19090/n50").replace(/\/$/, "");
if (!process.env.PLAYWRIGHT_ADMIN_PASSWORD) throw new Error("Protected admin password required");
const output = path.resolve("output/playwright/paper-audit-refresh");
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const login = await context.request.post(`${base}/auth/session/dev-login`, {
    data: { identifier: "admin", password: process.env.PLAYWRIGHT_ADMIN_PASSWORD },
  });
  if (!login.ok()) throw new Error(`Login ${login.status()}`);
  const page = await context.newPage();
  let completed = 0;
  let mutations = 0;
  page.on("request", (request) => {
    if (request.url().includes("/paper-trading") && request.method() !== "GET") mutations++;
  });
  page.on("response", (response) => {
    if (response.url().endsWith("/v1/workspace/paper-trading") && response.ok()) completed++;
  });
  await page.goto(`${base}/paper-trading`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    const node = document.querySelector('[data-testid="paper-refresh-time"]');
    return node && !node.textContent.includes("Waiting for complete ledger");
  }, null, { timeout: 120_000 });
  const count = await page.locator("#trades tbody tr").count();
  if (!count) throw new Error("No hydrated rows");
  await page.getByTestId("paper-audit-methodology").locator("summary").click();
  await page.getByText("Target touches are observations", { exact: false }).waitFor();
  await page.screenshot({ path: path.join(output, "desktop.png"), fullPage: true });
  const deadline = Date.now() + 120_000;
  while (completed < 2 && Date.now() < deadline) await page.waitForTimeout(1000);
  if (completed < 2) throw new Error("Automatic refresh did not complete");
  if (!await page.locator("#trades tbody tr").count()) throw new Error("Refresh dropped trade rows");
  if (mutations) throw new Error(`Refresh caused ${mutations} mutations`);
  const api = await context.request.get(`${base}/v1/workspace/paper-trading`, { timeout: 120_000 });
  const payload = await api.json();
  if (!api.ok() || !payload.stockTrades?.every((trade) => trade.evidence_audit)) throw new Error("Audit metadata missing");
  const result = { status: "PASS", initialRows: count, completedRefreshes: completed, mutations, auditRows: payload.stockTrades.length };
  await fs.writeFile(path.join(output, "result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
