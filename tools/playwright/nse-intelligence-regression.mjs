import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = (process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:19090/n50").replace(/\/$/, "");
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
const outputDir = path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR ?? "output/playwright/nse-intelligence");
if (!password) throw new Error("PLAYWRIGHT_ADMIN_PASSWORD is required");
await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
const check = (name, passed, detail = "") => { results.push({ name, passed, detail }); if (!passed) throw new Error(`${name}: ${detail}`); };

try {
  for (const viewport of [{ name: "desktop-1920x1080", width: 1920, height: 1080 }, { name: "mobile-390x844", width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport });
    const login = await context.request.post(`${baseUrl}/auth/session/dev-login`, { data: { identifier: "admin", password } });
    check(`${viewport.name} login`, login.ok(), `status=${login.status()}`);
    const page = await context.newPage();
    const errors = [];
    page.on("console", (message) => { if (message.type() === "error" && !/cloudflareinsights|clarity\.ms/i.test(message.text())) errors.push(message.text()); });
    await page.goto(`${baseUrl}/institutional/nse-intelligence`, { waitUntil: "networkidle", timeout: 60_000 });
    await page.getByRole("heading", { name: "NSE Intelligence", exact: true }).waitFor();
    check(`${viewport.name} canonical route`, page.url().includes("/institutional/nse-intelligence"), page.url());
    check(`${viewport.name} header tab`, await page.getByRole("link", { name: "NSE Intelligence", exact: true }).count() >= 1, "Header tab missing");
    check(`${viewport.name} actual degraded state`, await page.getByText("DEGRADED", { exact: true }).count() >= 1 && await page.getByText("5/17", { exact: true }).count() >= 1, "Current report state missing");
    check(`${viewport.name} actual breadth`, await page.getByText("1,451", { exact: true }).count() >= 1 && await page.getByText("976", { exact: true }).count() >= 1, "Official breadth missing");
    check(`${viewport.name} no static unavailable widgets`, await page.getByText("Unavailable analysis is intentionally hidden", { exact: true }).count() === 1, "Missing-data boundary absent");
    await page.getByRole("link", { name: "Reports & Health", exact: true }).click();
    await page.getByRole("heading", { name: "Reports & Health", exact: true }).waitFor();
    check(`${viewport.name} report rows`, await page.locator("tbody tr").count() === 17, `rows=${await page.locator("tbody tr").count()}`);
    check(`${viewport.name} missing reason`, await page.getByText("No official file was available", { exact: true }).count() >= 1, "Missing reason absent");
    check(`${viewport.name} no body overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `scroll=${await page.evaluate(() => document.documentElement.scrollWidth)}`);
    check(`${viewport.name} console clean`, errors.length === 0, errors.join(" | "));
    await page.screenshot({ path: path.join(outputDir, `${viewport.name}.png`), fullPage: true });
    await context.close();
  }
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await context.request.post(`${baseUrl}/auth/session/dev-login`, { data: { identifier: "admin", password } });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/nse-intelligence`, { waitUntil: "networkidle" });
  check("compatibility redirect", page.url().includes("/institutional/nse-intelligence"), page.url());
  await context.close();
} finally {
  await browser.close();
  await fs.writeFile(path.join(outputDir, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
}
console.log(JSON.stringify({ checks: results.length, passed: results.filter((row) => row.passed).length, outputDir }, null, 2));
