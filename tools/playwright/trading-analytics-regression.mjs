import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
const base = (
  process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:19090/n50"
).replace(/\/$/, "");
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
if (!password)
  throw new Error(
    "PLAYWRIGHT_ADMIN_PASSWORD required from protected environment",
  );
const out = path.resolve(
  process.env.PLAYWRIGHT_OUTPUT_DIR ??
    "output/playwright/trading-analytics-20260907",
);
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass, detail });
  if (!pass) throw new Error(`${name}: ${detail}`);
}
try {
  for (const [width, height] of [
    [1920, 1080],
    [1440, 900],
    [1024, 768],
    [390, 844],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      reducedMotion: "reduce",
    });
    const login = await context.request.post(`${base}/auth/session/dev-login`, {
      headers: { Origin: new URL(base).origin },
      data: { identifier: "admin", password },
    });
    check(`${width} authenticated login`, login.ok(), String(login.status()));
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const started = Date.now();
    await page.goto(`${base}/strategy/trading-analytics`, {
      waitUntil: "domcontentloaded",
    });
    await page
      .getByRole("heading", { name: "Trading Analytics", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Full evidence JSON" })
      .waitFor({ timeout: 45000 });
    const payload = await page.evaluate(async () => {
      const r = await fetch("/n50/v1/trading-analytics");
      return { status: r.status, body: await r.json() };
    });
    const d = payload.body;
    check(
      `${width} API and safety`,
      payload.status === 200 &&
        d.liveOrdersEnabled === false &&
        d.paperOrdersEnabled === false,
    );
    check(
      `${width} real inputs and source health`,
      d.activity.length > 0 &&
        d.participants.length > 0 &&
        d.errors.length === 0,
      JSON.stringify({ rows: d.activity.length, errors: d.errors }),
    );
    results.push({
      name: `${width} first useful evidence`,
      pass: true,
      durationMs: Date.now() - started,
    });
    for (const [view, label] of [
      ["morning", "Morning Brief"],
      ["activity", "FII Activity"],
      ["participants", "Participant OI"],
      ["options", "NIFTY Options"],
      ["structure", "Price & EMA"],
      ["scalper", "Scalper / Exact Contracts"],
      ["replay", "History / Replay"],
      ["health", "Policy & Data Health"],
    ]) {
      const time = Date.now();
      await page
        .getByRole("navigation", { name: "Trading analytics lenses" })
        .getByRole("button", { name: label, exact: true })
        .click();
      check(
        `${width} ${view} URL`,
        new URL(page.url()).searchParams.get("view") === view,
      );
      if (view === "scalper")
        await page
          .getByText(/source minutes/)
          .first()
          .waitFor({ timeout: 45000 });
      await page.screenshot({
        path: path.join(out, `${width}-${view}.png`),
        fullPage: true,
      });
      check(
        `${width} ${view} no page horizontal overflow`,
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      if (["morning", "health", "replay"].includes(view))
        check(
          `${width} ${view} inactive charts unmounted`,
          (await page.locator("main canvas").count()) === 0,
        );
      results.push({
        name: `${width} ${view} switch and screenshot`,
        pass: true,
        durationMs: Date.now() - time,
      });
    }
    await page
      .getByRole("navigation", { name: "Trading analytics lenses" })
      .getByRole("button", { name: "NIFTY Options", exact: true })
      .click();
    const downloadPending = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Export source rows CSV", exact: true })
      .click();
    const downloaded = await downloadPending;
    const csv = await fs.readFile(await downloaded.path(), "utf8");
    check(
      `${width} option CSV row parity`,
      csv.split("\r\n").length === d.chain.legs.length + 1,
    );
    check(
      `${width} option CSV exact contracts`,
      d.chain.legs.every(
        (l) =>
          l.instrument_identifier == null ||
          csv.includes(String(l.instrument_identifier)),
      ),
    );
    await downloaded.saveAs(path.join(out, `${width}-option-export.csv`));
    const accessible = await new AxeBuilder({ page }).include("main").analyze();
    await fs.writeFile(
      path.join(out, `${width}-axe.json`),
      JSON.stringify(accessible.violations, null, 2),
    );
    check(
      `${width} main accessibility`,
      accessible.violations.length === 0,
      accessible.violations.map((v) => v.id).join(","),
    );
    check(`${width} no uncaught JS`, errors.length === 0, errors.join(";"));
    await page.keyboard.press("Tab");
    check(
      `${width} keyboard focus`,
      await page.evaluate(() => document.activeElement?.tagName !== "BODY"),
    );
    await context.close();
  }
} finally {
  await browser.close();
  await fs.writeFile(
    path.join(out, "results.json"),
    JSON.stringify(results, null, 2),
  );
}
console.log(
  JSON.stringify({
    checks: results.filter((r) => r.durationMs == null).length,
    passed: results.filter((r) => r.pass && r.durationMs == null).length,
    output: out,
  }),
);
