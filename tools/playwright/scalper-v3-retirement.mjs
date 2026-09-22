import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const base = (process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:19090/n50").replace(/\/$/, "");
const output = path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR ?? "/home/novius2/NIFTY50/evidence/scalper-v3-retirement-20260922");
const envText = await fs.readFile(process.env.PLAYWRIGHT_ENV_FILE ?? ".env", "utf8");
const rawPassword = process.env.PLAYWRIGHT_ADMIN_PASSWORD ?? envText.split(/\r?\n/).find((line) => line.startsWith("DEV_LOCAL_AUTH_PASSWORD="))?.split("=").slice(1).join("=").trim();
const password = rawPassword?.replace(/^"|"$/g, "");
if (!password) throw new Error("Protected admin password is required");
await fs.mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const checks = [];
const check = (name, passed, detail = "") => {
  checks.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}: ${detail}`);
};

try {
  const login = await context.request.post(`${base}/auth/session/dev-login`, {
    headers: { Origin: new URL(base).origin },
    data: { identifier: "admin", password },
  });
  check("authenticated", login.ok(), `HTTP ${login.status()}`);

  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto(`${base}/strategy/trading-analytics?view=scalper_v3`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("scalper-v2").waitFor({ state: "visible", timeout: 60_000 });
  await page.waitForFunction(() => new URLSearchParams(location.search).get("view") === "scalper_v2");
  check("legacy route canonicalized", new URL(page.url()).searchParams.get("view") === "scalper_v2", page.url());
  const v3ButtonCount = await page.getByRole("button", { name: "Scalper V3", exact: true }).count();
  const v2ButtonCount = await page.getByRole("button", { name: "Scalper V2", exact: true }).count();
  check("V3 absent from navigation", v3ButtonCount === 0, `visible V3 buttons: ${v3ButtonCount}`);
  check("V2 remains available", v2ButtonCount === 1, `visible V2 buttons: ${v2ButtonCount}`);
  await page.screenshot({ path: path.join(output, "desktop-scalper-v2-after-v3-retirement.png"), fullPage: true });

  await page.goto(`${base}/strategy/trading-analytics?view=scalper_v3&popout=scalper_v3`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("scalper-v2").waitFor({ state: "visible", timeout: 60_000 });
  await page.waitForFunction(() => {
    const query = new URLSearchParams(location.search);
    return query.get("view") === "scalper_v2" && query.get("popout") === "scalper_v2";
  });
  const popoutUrl = new URL(page.url());
  check("legacy popout canonicalized", popoutUrl.searchParams.get("view") === "scalper_v2" && popoutUrl.searchParams.get("popout") === "scalper_v2", page.url());
  check("no page errors", pageErrors.length === 0, pageErrors.join(" | "));
} finally {
  await context.close();
  await browser.close();
}

await fs.writeFile(path.join(output, "results.json"), `${JSON.stringify({ base, checkedAt: new Date().toISOString(), checks }, null, 2)}\n`);
console.log(JSON.stringify({ output, passed: checks.length, checks }, null, 2));
