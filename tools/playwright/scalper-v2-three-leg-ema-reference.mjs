import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const base = (process.env.PLAYWRIGHT_BASE_URL ?? "https://n50.nifty50today.co.in/n50").replace(/\/$/, "");
const output = path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR ?? "/tmp/scalper-v2-three-leg-ema-reference");
const env = await fs.readFile(process.env.PLAYWRIGHT_ENV_FILE ?? ".env", "utf8");
const rawPassword = process.env.PLAYWRIGHT_ADMIN_PASSWORD
  ?? env.split(/\r?\n/).find((line) => line.startsWith("DEV_LOCAL_AUTH_PASSWORD="))?.split("=").slice(1).join("=").trim();
const password = rawPassword?.replace(/^"|"$/g, "");
if (!password) throw new Error("Protected browser-test password is unavailable");
await fs.mkdir(output, { recursive: true });

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, status: pass ? "PASS" : "FAIL", detail });
  if (!pass) throw new Error(`${name}: ${detail}`);
};
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}),
});
try {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: "reduce" });
  const login = await context.request.post(`${base}/auth/session/dev-login`, {
    headers: { Origin: new URL(base).origin },
    data: { identifier: "admin", password },
  });
  check("Authenticated production session", login.ok(), `HTTP ${login.status()}`);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  let chartPayload = null;
  const chartResponses = [];
  page.on("response", async (response) => {
    if (!response.url().includes("/v1/trading-analytics/charts?") || new URL(response.url()).searchParams.get("interval") !== "5") return;
    try {
      chartPayload = await response.json();
      chartResponses.push({
        url: response.url(),
        panes: chartPayload?.panes?.map((pane) => ({
          symbol: pane.identity?.tradingsymbol,
          bars: pane.bars?.length ?? 0,
          closed: pane.bars?.filter((bar) => bar.closed === true).length ?? 0,
        })) ?? [],
        limitations: chartPayload?.limitations ?? [],
      });
    } catch { /* visible assertions report the failure */ }
  });
  await page.goto(`${base}/strategy/trading-analytics?view=scalper_v2&interval=5`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  const terminal = page.getByTestId("scalper-v2");
  await terminal.waitFor({ state: "visible", timeout: 90_000 });
  await page.waitForTimeout(2_000);
  const state = await terminal.getAttribute("data-potential-ema-state");
  const countAttribute = await terminal.getAttribute("data-potential-ema-references");
  const count = countAttribute === "" ? null : Number(countAttribute);
  check("Potential-reference evidence state is explicit", state === "READY" || state === "UNAVAILABLE" || state === "INACTIVE_TIMEFRAME", String(state));
  check("Reference count is shown only with sufficient evidence", state === "READY" ? Number.isInteger(count) && count >= 0 : count == null, JSON.stringify({ state, count }));
  const markerCounts = await Promise.all(["underlying", "call", "put"].map((id) => page.getByTestId(`v2-chart-body-${id}`).evaluate((element) => Number(element.dataset.potentialEmaMarkers))));
  check("Same three-instrument references render on all three panes", markerCounts.every((value) => value === (count ?? 0)), JSON.stringify({ count, markerCounts }));
  const markerStyles = await Promise.all(["underlying", "call", "put"].map((id) => page.getByTestId(`v2-chart-body-${id}`).evaluate((element) => element.dataset.potentialEmaMarkerStyle)));
  check("Potential references use the hollow tentative marker contract", markerStyles.every((value) => value === "hollow-triangle-60pct-transparent-tentative"), JSON.stringify(markerStyles));
  await page.getByRole("tab", { name: "Strategy", exact: true }).click();
  const rulesText = await page.getByTestId("v2-potential-ema-count").innerText();
  check("Strategy inspector labels evidence truthfully and as tentative", (state === "READY" ? rulesText.includes(`Tentative references ${count}`) : rulesText.includes("needs six completed 5m")) && rulesText.includes("not actual or executed trades") && rulesText.includes("60% transparent"), rulesText);
  check("Chart API returned three exact panes", chartPayload?.interval === 5 && chartPayload?.panes?.length === 3, JSON.stringify({ interval: chartPayload?.interval, panes: chartPayload?.panes?.length }));
  check("No browser page errors", errors.length === 0, JSON.stringify(errors));
  const day = new URL(page.url()).searchParams.get("day");
  const paneLatest = (chartPayload?.panes ?? []).map((pane) => ({
    symbol: pane.identity?.tradingsymbol,
    latest: pane.bars?.filter((bar) => bar.closed === true).at(-1)?.end ?? null,
  }));
  await page.screenshot({ path: path.join(output, "scalper-v2-three-leg-ema-reference.png"), fullPage: true });
  await fs.writeFile(path.join(output, "results.json"), JSON.stringify({ results, selectedDay: day, potentialReferenceState: state, potentialReferenceCount: count, paneLatest, chartResponses }, null, 2));
} finally {
  await browser.close();
}
console.log(JSON.stringify({ passed: results.filter((row) => row.status === "PASS").length, total: results.length, output }));
