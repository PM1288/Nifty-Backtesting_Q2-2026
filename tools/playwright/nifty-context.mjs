import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const base =
  process.env.PLAYWRIGHT_BASE_URL ?? "https://n50.nifty50today.co.in/n50";
const out = path.resolve(
  process.env.PLAYWRIGHT_OUTPUT_DIR ?? "output/playwright/nifty-context",
);
const env = await fs.readFile("/home/novius2/trading-stack/.env", "utf8");
const password =
  process.env.PLAYWRIGHT_ADMIN_PASSWORD ??
  env
    .split(/\r?\n/)
    .find((l) => l.startsWith("DEV_LOCAL_AUTH_PASSWORD="))
    ?.split("=")
    .slice(1)
    .join("=")
    .trim();
if (!password) throw Error("Protected login credential missing");
await fs.mkdir(out, { recursive: true });
const checks = [];
const record = (name, pass, detail) =>
  checks.push({ name, pass: Boolean(pass), detail });
const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({
      viewport,
      reducedMotion: "reduce",
    });
    const login = await context.request.post(`${base}/auth/session/dev-login`, {
      data: { identifier: "admin", password },
      headers: { Origin: new URL(base).origin },
    });
    record(`${viewport.width} login`, login.ok(), login.status());
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    const started = performance.now();
    await page.goto(`${base}/strategy/nifty-context`, {
      waitUntil: "domcontentloaded",
    });
    const root = page.getByTestId("nifty-model-research");
    await root.waitFor();
    await root
      .getByText(/DATA INSUFFICIENT|EXPLORATORY/)
      .first()
      .waitFor({ timeout: 60000 });
    record(`${viewport.width} first saved evidence`, true, {
      ms: performance.now() - started,
    });
    const response = await context.request.get(`${base}/v1/nifty-context`);
    const payload = await response.json();
    record(
      `${viewport.width} no execution`,
      payload.executionEnabled === false,
    );
    record(
      `${viewport.width} real evidence saved`,
      Boolean(payload.report?.run_id),
    );
    const exported = await context.request.get(
      `${base}/v1/nifty-context/export/${payload.report.run_id}`,
    );
    const full = await exported.json();
    record(
      `${viewport.width} export includes all training and test snapshots`,
      full.snapshots?.length === payload.report.coverage.eligible_occasions,
      {
        snapshots: full.snapshots?.length,
        expected: payload.report.coverage.eligible_occasions,
      },
    );
    record(
      `${viewport.width} saved forecast parity`,
      full.predictions?.length === payload.predictions.length,
    );
    if (viewport.width === 1920)
      await fs.writeFile(
        path.join(out, "real-evidence.json"),
        JSON.stringify(full, null, 2),
      );
    for (const [lens, label] of [
      ["direction", "Hourly direction"],
      ["range", "Hourly range"],
      ["validation", "Model validation"],
      ["audit", "Data & audit"],
    ]) {
      const t = performance.now();
      await root.getByRole("button", { name: label, exact: true }).click();
      record(
        `${viewport.width} ${lens} URL`,
        new URL(page.url()).searchParams.get("lens") === lens,
        { switchMs: performance.now() - t },
      );
      const axe = await new AxeBuilder({ page })
        .include('[data-testid="nifty-model-research"]')
        .analyze();
      record(
        `${viewport.width} ${lens} axe`,
        axe.violations.length === 0,
        axe.violations.map((v) => v.id),
      );
      record(
        `${viewport.width} ${lens} no page overflow`,
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      await page.screenshot({
        path: path.join(out, `${viewport.width}-${lens}.png`),
        fullPage: true,
      });
    }
    await root
      .getByRole("button", { name: "Hourly range", exact: true })
      .focus();
    await page.keyboard.press("Enter");
    record(
      `${viewport.width} keyboard navigation`,
      new URL(page.url()).searchParams.get("lens") === "range",
    );
    await page.goBack();
    record(
      `${viewport.width} browser back`,
      new URL(page.url()).searchParams.get("lens") === "audit",
    );
    record(`${viewport.width} runtime errors`, errors.length === 0, errors);
    // TEST-ONLY browser response interception; never writes mock predictions to API/database.
    const example = {
      id: "test-only",
      result: {
        cutoff: "2026-09-08T04:47:00Z",
        window_end: "2026-09-08T05:47:00Z",
        probabilities: { DOWN: 0.2, SMALL: 0.5, UP: 0.3 },
        range_quantiles: { 0.1: 20, 0.5: 40, 0.9: 65 },
        features: { return_5: 0 },
        actual: { log_return: 0, range: 35 },
      },
      explanation: {
        feature_names: ["return_5"],
        groups: ["Price"],
        direction_base: [0, 0, 0],
        direction_contributions: [[0.1, 0.2, 0.3]],
        direction_output: [0.1, 0.2, 0.3],
        range_base: 30,
        range_contributions: [10],
        range_output: 40,
        background_id: "TEST_ONLY",
      },
    };
    await page.route("**/v1/nifty-context", (r) =>
      r.fulfill({
        json: {
          ...payload,
          state: "EXPLORATORY",
          report: { ...payload.report, reason: "TEST FIXTURE ONLY" },
          predictions: [example],
        },
      }),
    );
    await root.getByRole("button", { name: "Refresh", exact: true }).click();
    await root.getByText(/TEST FIXTURE ONLY/).waitFor();
    await root
      .getByRole("button", { name: "Hourly direction", exact: true })
      .click();
    record(
      `${viewport.width} model waterfall`,
      (await root.getByRole("img", { name: /SHAP waterfall/ }).count()) === 1,
    );
    record(
      `${viewport.width} margin units not probability`,
      (await root
        .getByText(/raw class margin \(not percentage points\)/)
        .count()) === 1,
    );
    await root
      .getByRole("combobox", { name: "Explanation target" })
      .selectOption("DOWN");
    record(
      `${viewport.width} class URL`,
      new URL(page.url()).searchParams.get("class") === "DOWN",
    );
    await page.screenshot({
      path: path.join(out, `${viewport.width}-TEST-ONLY-waterfall.png`),
      fullPage: true,
    });
    const fixtureAxe = await new AxeBuilder({ page })
      .include('[data-testid="nifty-model-research"]')
      .analyze();
    record(
      `${viewport.width} waterfall axe`,
      fixtureAxe.violations.length === 0,
      fixtureAxe.violations.map((v) => v.id),
    );
    await root
      .getByRole("button", { name: "Data & audit", exact: true })
      .click();
    record(
      `${viewport.width} inactive waterfall unmounted`,
      (await root.getByRole("img", { name: /SHAP waterfall/ }).count()) === 0,
    );
    await context.close();
  }
} finally {
  await browser.close();
  await fs.writeFile(
    path.join(out, "results.json"),
    JSON.stringify(checks, null, 2),
  );
}
console.log(
  JSON.stringify(
    {
      checks: checks.length,
      failed: checks.filter((c) => !c.pass),
      output: out,
    },
    null,
    2,
  ),
);
if (checks.some((c) => !c.pass)) process.exitCode = 1;
