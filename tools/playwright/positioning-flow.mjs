import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const appOrigin = process.env.POSITIONING_FLOW_APP_ORIGIN ?? "http://127.0.0.1:15190";
const authOrigin = process.env.POSITIONING_FLOW_AUTH_ORIGIN ?? "https://n50.nifty50today.co.in";
const output = path.resolve(process.env.POSITIONING_FLOW_OUTPUT ?? "/tmp/positioning-flow");
const envText = await fs.readFile(process.env.PLAYWRIGHT_ENV_FILE ?? ".env", "utf8");
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD
  ?? envText.split(/\r?\n/).find((line) => line.startsWith("DEV_LOCAL_AUTH_PASSWORD="))?.split("=").slice(1).join("=").trim();
if (!password) throw new Error("Protected browser-test password is unavailable");
await fs.mkdir(output, { recursive: true });

const results = [];
const check = (id, pass, detail) => results.push({ id, status: pass ? "PASS" : "FAIL", detail });
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: "reduce", acceptDownloads: true });
  const login = await context.request.post(`${authOrigin}/n50/auth/session/dev-login`, { data: { identifier: "admin", password }, headers: { Origin: authOrigin } });
  check("AUTH", login.ok(), `HTTP ${login.status()}`);
  const session = (await context.storageState()).cookies.find((cookie) => cookie.name.includes("session"));
  if (session) await context.addCookies([{ ...session, domain: "127.0.0.1", path: "/", secure: false, sameSite: "Lax" }]);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(`${appOrigin}/n50/strategy/trading-analytics?view=flow`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  const dashboard = page.getByTestId("positioning-flow");
  await dashboard.waitFor({ state: "visible", timeout: 90_000 });
  await page.waitForTimeout(1_000);
  check("TOP-LEVEL-TAB", await page.getByRole("button", { name: "Positioning & Flow", exact: true }).count() === 1, "additive Trading Analytics tab present");
  check("PARTICIPANTS", await dashboard.locator("button").filter({ hasText: /FII|Pro|Client \(reported\)|DII/ }).count() >= 4 && (await dashboard.innerText()).includes("Client (reported)"), "four aggregate participants with exact Client label");
  check("HERO-CHARTS", await dashboard.getByRole("img").count() === 2, "quadrant and rotation charts mounted");
  const matrix = page.getByTestId("positioning-flow-strike-matrix");
  check("STRIKE-MATRIX", await matrix.count() === 1 && await matrix.locator("tbody tr").count() > 0, `${await matrix.locator("tbody tr").count()} tracked strikes`);
  const text = await dashboard.innerText();
  check("DATASET-SEPARATION", text.includes("Activity/value is not outstanding position") && text.includes("selected expiry / tracked strikes") && text.includes("all index derivatives"), "activity, position and anonymous NIFTY-expiry chain scopes are explicit");
  check("NO-OWNERSHIP-CLAIM", !/FII (?:at|owns) [\d,]+/i.test(text), "no participant-by-strike attribution");
  check("ABOVE-FOLD-SUMMARY", (await matrix.boundingBox())?.y < 1080, `matrix top=${(await matrix.boundingBox())?.y}`);
  for (const label of ["Export JSON", "Export CSV"]) {
    const [download] = await Promise.all([page.waitForEvent("download"), dashboard.getByRole("button", { name: label, exact: true }).click()]);
    check(`${label.toUpperCase().replace(" ", "-")}`, Boolean(download.suggestedFilename()), download.suggestedFilename());
  }
  await dashboard.getByRole("button", { name: "Market Flow", exact: true }).click();
  await page.waitForTimeout(250);
  const bubbleCount = await dashboard.getByRole("img", { name: /Strike by signed change/ }).count();
  const marketText = await dashboard.innerText();
  check("BUBBLE-MAP", bubbleCount === 1 || marketText.includes("Change baseline unavailable"), bubbleCount === 1 ? "bubble map visible" : "truthful missing-baseline state visible");
  await dashboard.getByRole("button", { name: "Candidate Levels", exact: true }).click();
  const levels = page.getByTestId("positioning-flow-likely-levels");
  await levels.waitFor({ state: "visible" });
  const levelText = await levels.innerText();
  check("CANDIDATE-LEVELS", await levels.locator("tbody tr").count() > 0 || levelText.includes("No eligible levels"), "ranked candidates or truthful insufficient-evidence state visible");
  check("LEVEL-SCOPE", levelText.includes("does not assign FII, Pro or Client ownership") && !/FII level|Pro level/i.test(levelText), "aggregate participant context remains separate from anonymous strikes");
  check("LEVEL-AVAILABILITY", levelText.includes("Persistence") && levelText.includes("requires multi-snapshot") && levelText.includes("contract delta source not connected"), "unsupported persistence and delta weighting are explicit");
  check("PARTICIPANT-VOLUME", levelText.includes("Participant-wise trading volumes") && levelText.includes("never attributed to a NIFTY strike"), "existing participant-volume report is integrated with correct scope");
  await levels.locator("details").getByText("Level score and evidence policy", { exact: true }).click();
  const expandedLevelText = await levels.innerText();
  check("MODEL-DISCLOSURE", expandedLevelText.includes("L0") && expandedLevelText.includes("L1") && expandedLevelText.includes("never probabilities"), "versioned L0/L1 fallback and non-probability wording visible");
  check("ACTIVITY-SHARES", levelText.includes("Buy-side share") && levelText.includes("Sell-side share") && levelText.includes("Position-flow residual"), "gross and sided participant activity remain separate from position change");
  await page.screenshot({ path: path.join(output, "positioning-flow-candidate-levels-1920x1080.png"), fullPage: true });
  await dashboard.getByRole("button", { name: "History", exact: true }).click();
  check("HISTORY", await page.getByTestId("morning-participant-history").count() === 1, "existing participant history reused");
  await dashboard.getByRole("button", { name: "Evaluation", exact: true }).click();
  check("EVALUATION", await dashboard.getByText(/Historical evaluation/).count() === 1 && (await dashboard.innerText()).includes("not causal") && (await dashboard.innerText()).includes("no production result is claimed"), "matched daily evaluation and no-lookahead limitation disclosure visible");
  await dashboard.getByRole("button", { name: "Data Coverage", exact: true }).click();
  const coverage = page.getByTestId("positioning-flow-coverage");
  const coverageText = await coverage.innerText();
  const coverageTextLower = coverageText.toLowerCase();
  check("DATA-COVERAGE", coverageTextLower.includes("participant oi") && coverageTextLower.includes("nifty chain snapshots") && coverageText.includes("Pilot shortfall"), "loaded dates and 60-session shortfall are visible by family");
  check("COVERAGE-MISSINGNESS", coverageText.includes("Validation evidence unavailable"), "loaded rows are not relabelled downloaded/parsed/validated");
  check("NO-PAGE-ERRORS", errors.length === 0, errors.join(" | ") || "none");
  await dashboard.getByRole("button", { name: "Overview", exact: true }).click();
  await page.screenshot({ path: path.join(output, "positioning-flow-1920x1080.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const pageOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("NARROW-CONTAINMENT", pageOverflow <= 2, `page overflow ${pageOverflow}px`);
  await page.screenshot({ path: path.join(output, "positioning-flow-390x844.png"), fullPage: true });
  await fs.writeFile(path.join(output, "results.json"), JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
console.log(JSON.stringify({ checks: results.length, passed: results.filter((row) => row.status === "PASS").length, failed: results.filter((row) => row.status === "FAIL") }, null, 2));
if (results.some((row) => row.status === "FAIL")) process.exitCode = 1;
