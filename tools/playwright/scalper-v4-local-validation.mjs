import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const appOrigin = process.env.SCALPER_V4_APP_ORIGIN ?? "http://127.0.0.1:15173";
const liveOrigin = process.env.SCALPER_V4_AUTH_ORIGIN ?? "https://n50.nifty50today.co.in";
const output = path.resolve(process.env.SCALPER_V4_OUTPUT ?? "output/playwright/scalper-v4-local-20260909");
const password = (await fs.readFile(process.env.PLAYWRIGHT_ENV_FILE ?? ".env", "utf8"))
  .split(/\r?\n/)
  .find((line) => line.startsWith("DEV_LOCAL_AUTH_PASSWORD="))
  ?.split("=")
  .slice(1)
  .join("=")
  .trim();
if (!password) throw new Error("Protected browser-test password is unavailable");
await fs.mkdir(path.join(output, "screenshots"), { recursive: true });

const checks = [];
function check(name, pass, detail = "") {
  checks.push({ name, pass: Boolean(pass), detail });
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: "reduce" });
  const login = await context.request.post(`${liveOrigin}/n50/auth/session/dev-login`, {
    data: { identifier: "admin", password },
    headers: { Origin: liveOrigin },
  });
  check("authorised session", login.ok(), `HTTP ${login.status()}`);
  const state = await context.storageState();
  const session = state.cookies.find((cookie) => cookie.name.includes("session"));
  check("session cookie issued", Boolean(session), "No session cookie");
  await context.addCookies([{
    ...session,
    domain: "127.0.0.1",
    path: "/",
    secure: false,
    sameSite: "Lax",
  }]);

  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("clarity.ms")) errors.push(message.text());
  });
  await page.goto(`${appOrigin}/n50/strategy/trading-analytics?view=scalper&interval=5`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const terminal = page.getByTestId("aligned-scalper-terminal");
  await terminal.waitFor({ state: "visible", timeout: 60_000 });
  await page.getByText("Loading retained minute paths…", { exact: true }).waitFor({ state: "hidden", timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(1_000);

  const labels = terminal.locator('[data-testid^="aligned-pane-label-"]');
  check("five baseline panes", await labels.count() === 5, `${await labels.count()} labels`);
  const tops = await labels.evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().top)));
  check("underlying pane minimum", tops[1] - tops[0] >= 300, JSON.stringify(tops));
  check("call pane minimum", tops[2] - tops[1] >= 195, JSON.stringify(tops));
  check("put pane minimum", tops[3] - tops[2] >= 195, JSON.stringify(tops));
  check("OI pane minimum", tops[4] - tops[3] >= 115, JSON.stringify(tops));
  const viewport = terminal.locator('[aria-label="Scrollable aligned chart stack"]');
  const viewportGeometry = await viewport.evaluate((node) => ({ client: node.clientHeight, scroll: node.scrollHeight }));
  check("readable stack uses intentional internal scrolling", viewportGeometry.scroll > viewportGeometry.client, JSON.stringify(viewportGeometry));

  const prices = terminal.locator('[class*="alignedPairCards"] article strong');
  check("two selected premiums visible", await prices.count() === 2);
  const priceFonts = await prices.evaluateAll((nodes) => nodes.map((node) => Number.parseFloat(getComputedStyle(node).fontSize)));
  check("selected premiums are at least 26px", priceFonts.every((value) => value >= 26), JSON.stringify(priceFonts));
  check("identity includes pair and expiry", /pair/.test(await terminal.locator('[class*="alignedInspectorSummary"] header').innerText()));
  const profileSelect = terminal.locator("label").filter({ hasText: /^Profile/ }).locator("select");
  const profileOptions = await profileSelect.locator("option").count();
  check("OI profile offers current, delta and composite modes", profileOptions === 3, `${profileOptions} options`);

  const root = terminal.locator('[class*="alignedChartHost"] > *').first();
  await root.evaluate((node) => { node.dataset.lifecycleProbe = "stable"; });
  await terminal.evaluate((node) => { node.dataset.componentProbe = "stable"; });
  const surface = terminal.getByRole("region", { name: "Aligned NIFTY, exact call, exact put and evidence panes" });
  const box = await surface.boundingBox();
  if (box) await page.mouse.move(box.x + 300, box.y + 150, { steps: 5 });
  await page.waitForTimeout(100);
  check("cursor does not recreate chart", await root.getAttribute("data-lifecycle-probe") === "stable");

  const divider = terminal.getByRole("button", { name: "Resize evidence inspector" });
  const dividerBox = await divider.boundingBox();
  if (dividerBox) {
    await page.mouse.move(dividerBox.x + 2, dividerBox.y + 200);
    await page.mouse.down();
    await page.mouse.move(dividerBox.x - 40, dividerBox.y + 200);
    await page.mouse.up();
  }
  check("divider resize does not recreate chart", await root.getAttribute("data-lifecycle-probe") === "stable");
  const contextBeforeRefresh = {
    data: await terminal.getAttribute("data-chart-context"),
    config: await terminal.getAttribute("data-chart-config"),
  };
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await page.waitForTimeout(1_200);
  const contextAfterRefresh = {
    data: await terminal.getAttribute("data-chart-context"),
    config: await terminal.getAttribute("data-chart-config"),
  };
  check("ordinary refresh does not recreate chart", await root.getAttribute("data-lifecycle-probe") === "stable", JSON.stringify({
    contextBeforeRefresh,
    contextAfterRefresh,
    componentProbe: await terminal.getAttribute("data-component-probe"),
  }));

  await terminal.getByLabel("Inspector sections").getByRole("button", { name: "Rules" }).click();
  check("V7 rules remain visible", (await terminal.innerText()).includes("Paired EMA9 entry · V7"));
  await terminal.getByLabel("Inspector sections").getByRole("button", { name: "Levels" }).click();
  check("levels remain accessible", (await terminal.innerText()).includes("All structural levels"));
  await terminal.getByLabel("Inspector sections").getByRole("button", { name: "Measure" }).click();
  check("A-open/B-close basis remains visible", (await terminal.innerText()).includes("A open → B close"));

  for (const name of ["RSI", "MACD", "PCR"]) await terminal.getByLabel(name, { exact: true }).check();
  await page.waitForTimeout(400);
  const expandedText = await terminal.innerText();
  check("RSI separate pane", expandedText.includes("RSI 14 · 0–100"));
  check("MACD separate pane", expandedText.includes("MACD 12/26/9"));
  check("PCR separate pane", expandedText.includes("PAIR OI PCR · MATCHED ENDPOINT"));
  await viewport.evaluate((node) => { node.scrollTop = node.scrollHeight; });
  await page.screenshot({ path: path.join(output, "screenshots", "scalper-v4-separated-analytics-1920x1080.png"), fullPage: true, animations: "disabled" });
  for (const name of ["RSI", "MACD", "PCR"]) await terminal.getByLabel(name, { exact: true }).uncheck();
  await terminal.getByLabel("Inspector sections").getByRole("button", { name: "Snapshot" }).click();
  await viewport.evaluate((node) => { node.scrollTop = 0; });

  await page.screenshot({ path: path.join(output, "screenshots", "scalper-v4-1920x1080.png"), fullPage: true, animations: "disabled" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(300);
  check("1440 has no horizontal page overflow", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
  await page.screenshot({ path: path.join(output, "screenshots", "scalper-v4-1440x900.png"), fullPage: true, animations: "disabled" });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.waitForTimeout(300);
  check("1366 has no horizontal page overflow", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
  await page.screenshot({ path: path.join(output, "screenshots", "scalper-v4-1366x768.png"), fullPage: true, animations: "disabled" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  check("mobile has no horizontal page overflow", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
  check("mobile stacks inspector below chart", await terminal.evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(" ").length === 1));
  const inspectorButton = terminal.getByRole("button", { name: "Inspector", exact: true });
  await inspectorButton.click();
  const mobileInspector = terminal.getByLabel("Aligned terminal evidence inspector");
  const sheetGeometry = await mobileInspector.evaluate((node) => {
    const box = node.getBoundingClientRect();
    return { position: getComputedStyle(node).position, left: box.left, right: box.right, viewport: innerWidth };
  });
  check("mobile inspector opens as a sheet", sheetGeometry.position === "fixed" && sheetGeometry.left <= 2 && Math.abs(sheetGeometry.right - sheetGeometry.viewport) <= 4, JSON.stringify(sheetGeometry));
  await page.screenshot({ path: path.join(output, "screenshots", "scalper-v4-390x844.png"), fullPage: true, animations: "disabled" });
  await page.keyboard.press("Escape");
  check("Escape closes mobile inspector and restores focus", await inspectorButton.evaluate((node) => document.activeElement === node));
  check("no runtime errors", errors.length === 0, errors.join(" | "));

  await fs.writeFile(path.join(output, "acceptance-results.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), checks }, null, 2)}\n`);
  const failed = checks.filter((item) => !item.pass);
  console.log(JSON.stringify({ output, passed: checks.length - failed.length, checks: checks.length, failed }, null, 2));
  if (failed.length) process.exitCode = 1;
} finally {
  await browser.close();
}
