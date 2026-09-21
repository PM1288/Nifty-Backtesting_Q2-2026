import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const requireFromTools = createRequire(path.join(repoRoot, "tools/playwright/package.json"));
const { chromium } = requireFromTools("playwright");

const baseUrl = process.env.SCALPER_CAPTURE_BASE_URL ?? "http://127.0.0.1:19090";
const outputRoot = process.env.SCALPER_CAPTURE_OUTPUT_ROOT ?? "/home/novius2/NIFTY50/00-Screnshots";
const interval = process.env.SCALPER_CAPTURE_INTERVAL ?? "5";
const force = process.env.SCALPER_CAPTURE_FORCE === "1";
const envFile = process.env.SCALPER_CAPTURE_ENV_FILE ?? path.join(repoRoot, ".env");

function istParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(date);
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}

function captureWindow(parts) {
  if (["Sat", "Sun"].includes(parts.weekday)) return false;
  const minuteOfDay = Number(parts.hour) * 60 + Number(parts.minute);
  return minuteOfDay >= 9 * 60 + 15 && minuteOfDay <= 15 * 60 + 35;
}

async function passwordFromProtectedEnvironment() {
  if (process.env.PLAYWRIGHT_ADMIN_PASSWORD) return process.env.PLAYWRIGHT_ADMIN_PASSWORD;
  const envText = await fs.readFile(envFile, "utf8");
  const raw = envText.split(/\r?\n/).find((line) => line.startsWith("DEV_LOCAL_AUTH_PASSWORD="))?.split("=").slice(1).join("=").trim();
  return raw?.replace(/^['"]|['"]$/g, "");
}

const startedAt = new Date();
const parts = istParts(startedAt);
if (!force && !captureWindow(parts)) {
  console.log(JSON.stringify({ status: "SKIPPED", reason: "outside regular weekday capture window", ist: `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}` }));
  process.exit(0);
}

const day = `${parts.year}-${parts.month}-${parts.day}`;
const stamp = `${day}_${parts.hour}-${parts.minute}-${parts.second}_IST`;
const dayDirectory = path.join(outputRoot, day);
const basename = `scalper-v2-nifty-fit-day-${stamp}`;
const screenshotPath = path.join(dayDirectory, `${basename}.png`);
const jsonPath = path.join(dayDirectory, `${basename}.json`);
const errorPath = path.join(dayDirectory, `${basename}.error.json`);
await fs.mkdir(dayDirectory, { recursive: true });

async function adoptOutputOwnership(files) {
  if (typeof process.getuid !== "function" || process.getuid() !== 0) return;
  const owner = await fs.stat(path.dirname(outputRoot));
  await Promise.all([dayDirectory, ...files].map((file) => fs.chown(file, owner.uid, owner.gid)));
}

let browser;
try {
  const password = await passwordFromProtectedEnvironment();
  if (!password) throw new Error("Protected browser password is unavailable");

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
    acceptDownloads: true,
  });
  const login = await context.request.post(`${baseUrl}/n50/auth/session/dev-login`, {
    data: { identifier: "admin", password },
    headers: { Origin: baseUrl },
  });
  if (!login.ok()) throw new Error(`Authentication failed with HTTP ${login.status()}`);

  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error?.stack ?? error)));
  const route = `${baseUrl}/n50/strategy/trading-analytics?view=scalper_v2&interval=${encodeURIComponent(interval)}&popout=scalper_v2`;
  await page.goto(route, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.getByTestId("scalper-v2").waitFor({ state: "visible", timeout: 90_000 });
  await page.waitForFunction(() => (
    document.querySelectorAll("[data-testid^='v2-chart-host-'] .tv-lightweight-charts").length === 3
  ), undefined, { timeout: 90_000 });

  const fitDay = page.getByRole("button", { name: "Fit day", exact: true });
  await fitDay.click();
  await page.waitForFunction(() => [...document.querySelectorAll("[data-testid^='v2-chart-host-']")].every((element) => (
    element.dataset.horizontalView === "day"
      && Boolean(element.dataset.visibleLogicalFrom)
      && Boolean(element.dataset.visibleLogicalTo)
  )), undefined, { timeout: 30_000 });
  await page.waitForTimeout(1_000);

  const more = page.locator("details").filter({ has: page.getByText("More", { exact: true }) }).first();
  await more.locator("summary").click();
  const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
  await page.getByRole("button", { name: "Export JSON", exact: true }).click();
  const download = await downloadPromise;
  await download.saveAs(jsonPath);
  await page.screenshot({ path: screenshotPath, fullPage: true, animations: "disabled" });
  await adoptOutputOwnership([screenshotPath, jsonPath]);

  const geometry = await page.locator("[data-testid^='v2-chart-host-']").evaluateAll((elements) => elements.map((element) => ({
    id: element.getAttribute("data-testid"),
    visibleLogicalFrom: element.dataset.visibleLogicalFrom ?? null,
    visibleLogicalTo: element.dataset.visibleLogicalTo ?? null,
    refreshAt: element.closest("article")?.querySelector("time")?.getAttribute("datetime") ?? null,
  })));
  console.log(JSON.stringify({ status: "CAPTURED", screenshotPath, jsonPath, route, geometry, pageErrors }, null, 2));
} catch (error) {
  const failure = {
    status: "FAILED",
    capturedAt: startedAt.toISOString(),
    message: String(error?.stack ?? error),
  };
  await fs.writeFile(errorPath, `${JSON.stringify(failure, null, 2)}\n`, { mode: 0o644 });
  await adoptOutputOwnership([errorPath]);
  console.error(JSON.stringify({ ...failure, errorPath }));
  process.exitCode = 1;
} finally {
  await browser?.close();
}
