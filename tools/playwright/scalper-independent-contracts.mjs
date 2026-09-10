import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const base = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:15184/n50";
const authBase = process.env.PLAYWRIGHT_AUTH_BASE_URL ?? base;
const output = process.env.PLAYWRIGHT_OUTPUT_DIR ?? "/tmp/scalper-independent-contracts";
const env = await fs.readFile(process.env.PLAYWRIGHT_ENV_FILE ?? ".env", "utf8");
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD ?? env.split(/\r?\n/).find((line) => line.startsWith("DEV_LOCAL_AUTH_PASSWORD="))?.split("=").slice(1).join("=").trim();
if (!password) throw new Error("Protected browser-test password is unavailable");
await fs.mkdir(output, { recursive: true });

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, status: pass ? "PASS" : "FAIL", detail });
  if (!pass) throw new Error(`${name}: ${detail}`);
};
const optionValues = async (locator) => locator.locator("option").evaluateAll((options) => options.map((option) => option.value).filter(Boolean));
const distinctSelections = (ceValues, peValues) => {
  for (const ce of [...ceValues].reverse()) for (const pe of peValues) if (ce !== pe) return { ce, pe };
  return null;
};
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  const login = await context.request.post(`${authBase}/auth/session/dev-login`, { data: { identifier: "admin", password }, headers: { Origin: new URL(base).origin } });
  check("Authenticated local candidate", login.ok(), `HTTP ${login.status()}`);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));

  await page.goto(`${base}/strategy/trading-analytics?view=scalper&interval=5`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  const v1Ce = page.getByRole("combobox", { name: "Selected CE strike", exact: true });
  const v1Pe = page.getByRole("combobox", { name: "Selected PE strike", exact: true });
  await v1Ce.waitFor({ state: "visible", timeout: 90_000 });
  const v1Choice = distinctSelections(await optionValues(v1Ce), await optionValues(v1Pe));
  check("V1 exposes independent CE and PE choices", Boolean(v1Choice), JSON.stringify({ ce: await optionValues(v1Ce), pe: await optionValues(v1Pe) }));
  await v1Ce.selectOption(v1Choice.ce);
  const v1ResponsePromise = page.waitForResponse((response) => {
    if (!response.ok() || !response.url().includes("/v1/trading-analytics/charts?")) return false;
    const url = new URL(response.url());
    return url.searchParams.get("ceStrike") === v1Choice.ce && url.searchParams.get("peStrike") === v1Choice.pe;
  }, { timeout: 90_000 });
  await v1Pe.selectOption(v1Choice.pe);
  const v1Payload = await (await v1ResponsePromise).json();
  const v1Options = v1Payload.panes.filter((pane) => pane.identity.exchange === "NFO");
  check("V1 loads requested exact contracts", v1Options.some((pane) => String(pane.identity.tradingsymbol).endsWith("CE") && String(pane.identity.strike) === v1Choice.ce) && v1Options.some((pane) => String(pane.identity.tradingsymbol).endsWith("PE") && String(pane.identity.strike) === v1Choice.pe), JSON.stringify(v1Options.map((pane) => pane.identity)));
  const v1Url = new URL(page.url());
  check("V1 share state keeps both strikes", v1Url.searchParams.get("ceStrike") === v1Choice.ce && v1Url.searchParams.get("peStrike") === v1Choice.pe && !v1Url.searchParams.has("strike"), v1Url.search);
  await page.getByText("Measure A→B", { exact: true }).click();
  await page.getByRole("button", { name: "Fix contracts", exact: true }).click();
  check("V1 measurement locks both selectors", await v1Ce.isDisabled() && await v1Pe.isDisabled(), "CE and PE selectors disabled together");
  await page.screenshot({ path: path.join(output, "scalper-v1-independent-contracts.png"), fullPage: false });

  await page.goto(`${base}/strategy/trading-analytics?view=scalper_v2&interval=5`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.getByTestId("scalper-v2").waitFor({ state: "visible", timeout: 90_000 });
  const v2Ce = page.getByRole("combobox", { name: "Selected CE strike", exact: true });
  const v2Pe = page.getByRole("combobox", { name: "Selected PE strike", exact: true });
  const v2Choice = distinctSelections(await optionValues(v2Ce), await optionValues(v2Pe));
  check("V2 exposes independent CE and PE choices", Boolean(v2Choice), JSON.stringify({ ce: await optionValues(v2Ce), pe: await optionValues(v2Pe) }));
  const initialV2Pe = await v2Pe.inputValue();
  const v2CeResponsePromise = page.waitForResponse((response) => {
    if (!response.ok() || !response.url().includes("/v1/trading-analytics/charts?")) return false;
    const url = new URL(response.url());
    return url.searchParams.get("ceStrike") === v2Choice.ce && url.searchParams.get("peStrike") === initialV2Pe && url.searchParams.get("interval") === "5";
  }, { timeout: 90_000 });
  await v2Ce.selectOption(v2Choice.ce);
  await v2CeResponsePromise;
  await page.waitForTimeout(2_000);
  check("V2 remains mounted after CE selection", await page.getByTestId("scalper-v2").isVisible().catch(() => false), JSON.stringify({ url: page.url(), errors, body: (await page.locator("body").innerText()).slice(-800) }));
  const v2ResponsePromise = page.waitForResponse((response) => {
    if (!response.ok() || !response.url().includes("/v1/trading-analytics/charts?")) return false;
    const url = new URL(response.url());
    return url.searchParams.get("ceStrike") === v2Choice.ce && url.searchParams.get("peStrike") === v2Choice.pe && url.searchParams.get("interval") === "5";
  }, { timeout: 90_000 });
  await v2Pe.selectOption(v2Choice.pe);
  const v2Payload = await (await v2ResponsePromise).json();
  const v2Options = v2Payload.panes.filter((pane) => pane.identity.exchange === "NFO");
  check("V2 loads requested exact contracts", v2Options.some((pane) => String(pane.identity.tradingsymbol).endsWith("CE") && String(pane.identity.strike) === v2Choice.ce) && v2Options.some((pane) => String(pane.identity.tradingsymbol).endsWith("PE") && String(pane.identity.strike) === v2Choice.pe), JSON.stringify(v2Options.map((pane) => pane.identity)));
  const selectedGuides = await page.getByTestId("v2-chart-body-underlying").evaluate((element) => ({ ce: element.dataset.selectedCeStrike, pe: element.dataset.selectedPeStrike }));
  check("V2 underlying identifies both selected strikes", selectedGuides.ce === v2Choice.ce && selectedGuides.pe === v2Choice.pe, JSON.stringify(selectedGuides));
  check("V2 ΔOI axis declares visible strike and CE/PE values", (await page.getByTestId("v2-deltaoi-axis-context").innerText()).includes("Strike · CE ΔOI · PE ΔOI"), await page.getByTestId("v2-deltaoi-axis-context").innerText());
  check("No browser errors", errors.length === 0, errors.join(" | "));
  await page.screenshot({ path: path.join(output, "scalper-v2-independent-contracts.png"), fullPage: true });
} finally {
  await browser.close();
  await fs.writeFile(path.join(output, "results.json"), JSON.stringify(results, null, 2));
}
console.log(JSON.stringify({ passed: results.filter((result) => result.status === "PASS").length, total: results.length, output }));
