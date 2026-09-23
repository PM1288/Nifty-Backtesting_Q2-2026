import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const base = (process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:19090/n50").replace(/\/$/, "");
const output = path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR ?? "/home/novius2/NIFTY50/evidence/three-month-report-redesign-20260922");
const envText = await fs.readFile(process.env.PLAYWRIGHT_ENV_FILE ?? ".env", "utf8");
const rawPassword = process.env.PLAYWRIGHT_ADMIN_PASSWORD ?? envText.split(/\r?\n/).find((line) => line.startsWith("DEV_LOCAL_AUTH_PASSWORD="))?.split("=").slice(1).join("=").trim();
const password = rawPassword?.replace(/^"|"$/g, "");
if (!password) throw new Error("Protected admin password is required");
await fs.mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, acceptDownloads: true });
const checks = [];
const check = (name, passed, detail = "") => {
  checks.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}: ${detail}`);
};

try {
  const login = await context.request.post(`${base}/auth/session/dev-login`, { headers: { Origin: new URL(base).origin }, data: { identifier: "admin", password } });
  check("authenticated", login.ok(), `HTTP ${login.status()}`);

  const api = await context.request.get(`${base}/v1/backtesting/reports/three-month/latest`);
  check("report API", api.ok(), `HTTP ${api.status()}`);
  const report = await api.json();
  check("report identity", /^three_month_reversal_\d{8}$/.test(report.id) && report.id === (process.env.THREE_MONTH_EXPECTED_REPORT_ID ?? "three_month_reversal_20260923"), String(report.id));
  check("strategy validation", report.summary?.strategyValidation?.invalidSignals === 0 && report.summary?.strategyValidation?.oppositeSameDateSignals === 0 && report.summary?.strategyValidation?.mandatoryGateCount === 6, JSON.stringify(report.summary?.strategyValidation));
  check("summary contract", report.summary?.summary?.every((row) => ["average1", "average5", "average15", "maximum15", "minimum15", "drawdown15"].every((key) => Object.hasOwn(row, key))), JSON.stringify(report.summary?.summary?.[0]));
  check("stock trade page contract", report.summary?.reportPages?.stockCharts === report.summary?.symbols && report.summary?.reportPages?.stockTradeEvidence > 0 && report.summary?.reportPages?.expectedTotal === 1 + report.summary?.reportPages?.stockCharts + report.summary?.reportPages?.stockTradeEvidence && report.summary?.reportPages?.tradeRowsPerPage === 14, JSON.stringify(report.summary?.reportPages));
  const pdf = report.files?.find((file) => file.name.endsWith(".pdf"));
  const csv = report.files?.find((file) => file.name.endsWith(".csv"));
  check("report files", Number(pdf?.bytes) > 0 && Number(pdf?.bytes) < 80 * 1024 * 1024 && Number(csv?.bytes) > 0, JSON.stringify(report.files));

  const stockSummaryApi = await context.request.get(`${base}/v1/backtesting/reports/three-month/evidence`);
  check("stock summary API", stockSummaryApi.ok(), `HTTP ${stockSummaryApi.status()}`);
  const stockSummary = await stockSummaryApi.json();
  check("stock summary coverage", stockSummary.reportId === report.id && stockSummary.stocks?.length === report.summary?.symbols && stockSummary.stocks?.every((row) => row.bull && row.bear), `${stockSummary.reportId} · ${stockSummary.stocks?.length}`);
  const inspectedSymbol = stockSummary.stocks?.[0]?.symbol;
  const stockDetailApi = await context.request.get(`${base}/v1/backtesting/reports/three-month/evidence?symbol=${encodeURIComponent(inspectedSymbol)}`);
  check("stock detail API", stockDetailApi.ok(), `HTTP ${stockDetailApi.status()}`);
  const stockDetail = await stockDetailApi.json();
  check("stock exact condition evidence", stockDetail.stock?.symbol === inspectedSymbol && stockDetail.trades?.length > 0 && stockDetail.trades?.every((trade) => trade.mandatoryGates?.length === 6 && trade.historyPass?.length === 3 && Object.hasOwn(trade.references ?? {}, "twoMonthsAgoOpen") && Object.hasOwn(trade.references ?? {}, "threeMonthsAgoClose")), `${inspectedSymbol} · ${stockDetail.trades?.length}`);

  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`${base}/backtesting/reports`, { waitUntil: "networkidle" });
  await page.getByTestId("backtesting-reports").waitFor({ state: "visible", timeout: 45_000 });
  const header = await page.locator("thead").innerText();
  check("visible summary columns", header.includes("Avg 15D") && header.includes("Max 15D") && header.includes("Min 15D") && header.includes("Worst drawdown"), header);
  check("removed metrics absent", !header.includes("MFE") && !header.includes("MDD") && !header.includes("Reached +3%"), header);
  check("legend disclosure", await page.getByText(/Daily triangles retain exact dates/).isVisible(), "legend copy unavailable");
  check("period overlay disclosure", await page.getByText(/Daily chart includes month\/week boundaries/).isVisible(), "period overlay copy unavailable");
  check("stock table disclosure", await page.getByText(/Each stock table includes signal date/).isVisible(), "stock table copy unavailable");
  check("no page errors", pageErrors.length === 0, pageErrors.join(" | "));
  await page.screenshot({ path: path.join(output, "desktop-backtesting-reports.png"), fullPage: true });

  await page.goto(`${base}/strategy/three-month`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("three-month-stock-history").waitFor({ state: "visible", timeout: 45_000 });
  await page.getByText("Historical performance by stock").waitFor({ state: "visible", timeout: 45_000 });
  check("strategy page stock summary", await page.getByTestId(`three-month-report-stock-${inspectedSymbol}`).isVisible(), inspectedSymbol);
  await page.getByTestId(`three-month-report-stock-${inspectedSymbol}`).click();
  await page.getByTestId("three-month-report-stock-evidence").getByText(`${inspectedSymbol} · historical entries and conditions`).waitFor({ state: "visible", timeout: 45_000 });
  const conditionHeader = await page.getByTestId("three-month-report-stock-evidence").locator(".tradeViewport thead").innerText().catch(() => page.getByTestId("three-month-report-stock-evidence").locator("thead").last().innerText());
  check("strategy page exact condition columns", conditionHeader.includes("M−2 C vs O") && conditionHeader.includes("M−3 C vs O") && conditionHeader.includes("ANY-1 OR"), conditionHeader);
  await page.getByTestId("three-month-report-stock-evidence").screenshot({ path: path.join(output, "desktop-three-month-stock-evidence.png") });
  check("strategy page no errors", pageErrors.length === 0, pageErrors.join(" | "));
} finally {
  await context.close();
  await browser.close();
}

await fs.writeFile(path.join(output, "results.json"), `${JSON.stringify({ base, checkedAt: new Date().toISOString(), checks }, null, 2)}\n`);
console.log(JSON.stringify({ output, passed: checks.length, checks }, null, 2));
