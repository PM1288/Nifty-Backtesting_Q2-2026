import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const appOrigin = process.env.SCALPER_V2_APP_ORIGIN ?? "http://127.0.0.1:19090";
const authOrigin = process.env.SCALPER_V2_AUTH_ORIGIN ?? "https://n50.nifty50today.co.in";
const output = path.resolve(process.env.SCALPER_V2_OUTPUT ?? "/tmp/scalper-v2-delta-oi-only");
const password = (await fs.readFile(process.env.PLAYWRIGHT_ENV_FILE ?? ".env", "utf8"))
  .split(/\r?\n/).find((line) => line.startsWith("DEV_LOCAL_AUTH_PASSWORD="))?.split("=").slice(1).join("=").trim();
if (!password) throw new Error("Protected browser-test password is unavailable");
await fs.mkdir(output, { recursive: true });

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, status: pass ? "PASS" : "FAIL", detail });
  if (!pass) throw new Error(`${name}: ${detail}`);
};

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  const login = await context.request.post(`${authOrigin}/n50/auth/session/dev-login`, {
    data: { identifier: "admin", password }, headers: { Origin: authOrigin },
  });
  check("Authenticated production session", login.ok(), `HTTP ${login.status()}`);
  const session = (await context.storageState()).cookies.find((cookie) => cookie.name.includes("session"));
  if (session && new URL(appOrigin).hostname === "127.0.0.1") {
    await context.addCookies([{ ...session, domain: "127.0.0.1", path: "/", secure: false, sameSite: "Lax" }]);
  }

  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(`${appOrigin}/n50/strategy/trading-analytics?view=scalper_v2&interval=5`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.getByTestId("scalper-v2").waitFor({ state: "visible", timeout: 90_000 });
  const profile = page.getByTestId("v2-oi-profile");
  await profile.waitFor({ state: "visible", timeout: 30_000 });

  check("Underlying side profile is Delta OI only", await profile.getAttribute("data-mode") === "change", await profile.innerText());
  check("Profile explicitly labels the signed zero axis", /Negative ← 0 → Positive/.test(await profile.innerText()), await profile.innerText());
  check("Current and combined OI overlay controls are absent",
    await page.getByRole("button", { name: "Current OI", exact: true }).count() === 0
      && await page.getByRole("button", { name: "OI + ΔOI profile", exact: true }).count() === 0,
    "Current OI remains available only in the snapshot, matrix and analytical panels");

  const geometry = await page.getByTestId("v2-chart-body-underlying").evaluate((body) => ({
    bars: JSON.parse(body.dataset.profileGeometry || "[]"),
    maximumError: Number(body.dataset.profileMaxAlignmentError),
    laneWidth: Number(body.dataset.profileLaneWidth),
  }));
  check("Every painted side-profile bar is Delta OI", geometry.bars.length > 0 && geometry.bars.every((bar) => bar.metric === "change"), JSON.stringify(geometry.bars.slice(0, 8)));
  check("Delta OI remains strike-aligned", Number.isFinite(geometry.maximumError) && geometry.maximumError <= 2, `maximum error ${geometry.maximumError}px`);
  check("Profile lane remains bounded", geometry.laneWidth > 0 && geometry.laneWidth <= 180, `lane ${geometry.laneWidth}px`);
  check("CE and PE identities remain distinct", /CE blue/.test(await profile.innerText()) && /PE yellow/.test(await profile.innerText()), await profile.innerText());
  check("No browser errors", errors.length === 0, errors.join(" | "));
  await page.screenshot({ path: path.join(output, "scalper-v2-delta-oi-only.png"), fullPage: false });
} finally {
  await browser.close();
  await fs.writeFile(path.join(output, "results.json"), JSON.stringify(results, null, 2));
}

console.log(JSON.stringify({ passed: results.filter((result) => result.status === "PASS").length, total: results.length, output }));
