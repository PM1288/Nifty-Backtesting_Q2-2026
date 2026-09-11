import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const base = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:15184/n50";
const authBase = process.env.PLAYWRIGHT_AUTH_BASE_URL ?? base;
const authOrigin = process.env.PLAYWRIGHT_AUTH_ORIGIN ?? new URL(base).origin;
const output = process.env.PLAYWRIGHT_OUTPUT_DIR ?? "/tmp/scalper-v2-max-pain";
const env = await fs.readFile(process.env.PLAYWRIGHT_ENV_FILE ?? ".env", "utf8");
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD ?? env.split(/\r?\n/).find((line) => line.startsWith("DEV_LOCAL_AUTH_PASSWORD="))?.split("=").slice(1).join("=").trim();
if (!password) throw new Error("Protected browser-test password is unavailable");
await fs.mkdir(output, { recursive: true });

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, status: pass ? "PASS" : "FAIL", detail });
  if (!pass) throw new Error(`${name}: ${detail}`);
};
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  const login = await context.request.post(`${authBase}/auth/session/dev-login`, {
    data: { identifier: "admin", password }, headers: { Origin: authOrigin },
  });
  check("Authenticated isolated candidate", login.ok(), `HTTP ${login.status()}`);
  const sessionPair = (login.headers()["set-cookie"] ?? "").split(";", 1)[0];
  const separator = sessionPair.indexOf("=");
  if (separator > 0) await context.addCookies([{
    name: sessionPair.slice(0, separator), value: sessionPair.slice(separator + 1),
    domain: "127.0.0.1", path: "/", httpOnly: true, secure: false, sameSite: "Lax",
  }]);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(`${base}/strategy/trading-analytics?view=scalper_v2&interval=5`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.getByTestId("scalper-v2").waitFor({ state: "visible", timeout: 30_000 });
  const body = page.getByTestId("v2-chart-body-underlying");
  const status = page.getByTestId("v2-max-pain-chart-status");
  await status.waitFor({ state: "visible" });
  const initial = await status.innerText();
  check("Snapshot max pain is disclosed on underlying chart", /^Max pain [\d,]+/.test(initial), initial);
  check("Session Y does not stretch for out-of-session max pain", initial.includes("outside Session Y") || initial.includes("line plotted"), initial);
  if ((await body.getAttribute("data-max-pain-visible")) === "") {
    await page.getByRole("button", { name: "All strikes Y", exact: true }).click();
    await page.waitForFunction(() => Boolean(document.querySelector('[data-testid="v2-chart-body-underlying"]')?.getAttribute("data-max-pain-visible")));
  }
  const plotted = await body.evaluate((element) => ({
    candidates: element.dataset.maxPainStrikes ?? "", visible: element.dataset.maxPainVisible ?? "", status: element.dataset.maxPainStatus ?? "",
  }));
  check("Eligible max-pain candidates are plotted", plotted.status === "plotted" && plotted.visible === plotted.candidates, JSON.stringify(plotted));
  check("No browser errors", errors.length === 0, errors.join(" | "));
  await page.screenshot({ path: path.join(output, "scalper-v2-max-pain-line.png"), fullPage: true });
} finally {
  await browser.close();
  await fs.writeFile(path.join(output, "max-pain-results.json"), JSON.stringify(results, null, 2));
}
console.log(JSON.stringify({ passed: results.filter((result) => result.status === "PASS").length, total: results.length, output }));
