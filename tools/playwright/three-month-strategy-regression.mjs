import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const base = (process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:19090/n50").replace(/\/$/, "");
const output = path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR ?? "/home/novius2/NIFTY50/evidence/three-month-strategy-20260919");
const envText = await fs.readFile(process.env.PLAYWRIGHT_ENV_FILE ?? ".env", "utf8");
const rawPassword = process.env.PLAYWRIGHT_ADMIN_PASSWORD ?? envText.split(/\r?\n/).find((line) => line.startsWith("DEV_LOCAL_AUTH_PASSWORD="))?.split("=").slice(1).join("=").trim();
const password = rawPassword?.replace(/^"|"$/g, "");
if (!password) throw new Error("Protected admin password is required");
await fs.mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH });
const checks = [];
const check = (name, passed, detail = "") => { checks.push({ name, passed, detail }); if (!passed) throw new Error(`${name}: ${detail}`); };
for (const target of [{ name: "desktop", width: 1920, height: 1080 }, { name: "mobile", width: 390, height: 844 }]) {
  const context = await browser.newContext({ viewport: { width: target.width, height: target.height }, acceptDownloads: true });
  const login = await context.request.post(`${base}/auth/session/dev-login`, { headers: { Origin: new URL(base).origin }, data: { identifier: "admin", password } });
  check(`${target.name} login`, login.ok(), `HTTP ${login.status()}`);
  const page = await context.newPage();
  const response = await context.request.get(`${base}/v1/strategy/three-month?intradayMode=completed`);
  check(`${target.name} API`, response.ok(), `HTTP ${response.status()}`);
  const payload = await response.json();
  check(`${target.name} formula payload`, payload.strategyVersion === "three_month_recovery_v2" && payload.rows.length === payload.counts.universe, JSON.stringify(payload.counts));
  check(`${target.name} coverage disclosure`, payload.counts.universe > 0 && payload.counts.universe <= payload.counts.expectedUniverse && payload.counts.expectedUniverse === 500, JSON.stringify(payload.counts));
  check(`${target.name} qualification invariant`, payload.rows.filter((row) => row.qualification === "QUALIFIED").every((row) => row.gates.length === 12 && row.gates.filter((gate) => gate.timeframe === "5M").length === 2 && row.gates.every((gate) => gate.state === "PASS") && row.weaknessState === "PASS"), "qualified row mismatch");
  check(`${target.name} grouped scoring contract`, payload.rows.every((row) => [row.bull, row.bear].every((result) => result.totalConditionCount === 13 && result.scoredConditionCount === result.passedGateCount + Number(result.weaknessState === "PASS") && result.availableConditionCount === result.availableGateCount + Number(result.weaknessState === "PASS" || result.weaknessState === "FAIL"))), "M-3/M-2/M-1 OR group was not scored exactly once");
  await page.goto(`${base}/strategy/three-month`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("three-month-strategy").waitFor({ state: "visible", timeout: 45_000 });
  await page.getByText("Profile coverage").waitFor();
  check(`${target.name} route`, await page.getByRole("heading", { name: "3Month Strategy" }).isVisible(), page.url());
  const strategyTable = page.getByTestId("three-month-live-evidence").locator("table");
  const headerText = await strategyTable.locator("thead").innerText();
  check(`${target.name} grouped gates`, headerText.includes("15 Minute") && headerText.includes("5 Minute") && headerText.includes("Previous weakness") && headerText.indexOf("M−3") < headerText.indexOf("M−2") && headerText.indexOf("M−2") < headerText.indexOf("M−1"), headerText);
  check(`${target.name} completed default`, await page.getByLabel("Completed candles").isChecked(), "forming unexpectedly default");
  const firstRow = strategyTable.locator("tbody tr").first();
  check(`${target.name} rows`, await firstRow.isVisible(), `count=${await strategyTable.locator("tbody tr").count()}`);
  const presentation = await page.getByTestId("three-month-strategy").evaluate((root) => {
    const row = root.querySelector("tbody tr");
    const symbol = row?.querySelector("td:first-child a");
    return {
      pageBackground: getComputedStyle(root).backgroundColor,
      rowHeight: row?.getBoundingClientRect().height ?? 0,
      companyLines: row?.querySelectorAll("td:first-child small").length ?? -1,
      symbolTitle: symbol?.getAttribute("title") ?? "",
      rowTitle: row?.getAttribute("title") ?? "",
    };
  });
  check(`${target.name} light theme`, presentation.pageBackground === "rgb(245, 247, 251)", JSON.stringify(presentation));
  check(`${target.name} compact symbol rows`, presentation.rowHeight <= 32 && presentation.companyLines === 0, JSON.stringify(presentation));
  check(`${target.name} hover details`, presentation.symbolTitle.length > 0 && presentation.rowTitle.includes("scored conditions"), JSON.stringify(presentation));
  await firstRow.click();
  check(`${target.name} arithmetic drawer`, await page.getByText("Mandatory M/W/D/1H/15m/5m arithmetic").isVisible(), "drawer missing");
  await page.getByLabel("Close details").click();
  const formingResponse = page.waitForResponse((item) => item.url().includes("/v1/strategy/three-month?intradayMode=forming") && item.status() === 200, { timeout: 45_000 });
  await page.getByLabel("Include forming candle").check();
  await formingResponse;
  check(`${target.name} forming disclosure`, await page.getByText(/may reverse before close/).isVisible(), "forming warning missing");
  if (target.name === "desktop") {
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download CSV" }).click();
    const download = await downloadPromise;
    check("CSV export", download.suggestedFilename() === "three-month-strategy-bull-forming.csv", download.suggestedFilename());
  }
  await page.screenshot({ path: path.join(output, `${target.name}-three-month-strategy.png`), fullPage: true });
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
  const homeBoard = page.getByTestId("home-three-month-selector");
  await homeBoard.waitFor({ state: "visible", timeout: 45_000 });
  await homeBoard.getByText("3MONTH BULL", { exact: true }).waitFor({ state: "visible", timeout: 45_000 });
  const boardText = await homeBoard.innerText();
  check(`${target.name} home OR group`, boardText.includes("M−3 OR M−2 OR M−1") && boardText.includes("1 pt"), boardText.slice(0, 500));
  check(`${target.name} home bull bear`, boardText.includes("3MONTH BULL") && boardText.includes("3MONTH BEAR"), boardText.slice(0, 500));
  check(`${target.name} home 5m pair`, boardText.includes("5m") && /\b\d+\/13\b/.test(boardText), boardText.slice(0, 500));
  await homeBoard.screenshot({ path: path.join(output, `${target.name}-home-three-month-selector.png`) });
  await context.close();
}
await browser.close();
await fs.writeFile(path.join(output, "results.json"), `${JSON.stringify({ base, checkedAt: new Date().toISOString(), checks }, null, 2)}\n`);
console.log(JSON.stringify({ output, passed: checks.length, checks }, null, 2));
