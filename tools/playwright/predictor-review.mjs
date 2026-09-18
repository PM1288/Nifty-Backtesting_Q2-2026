import fs from "node:fs/promises";
import assert from "node:assert/strict";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
const origin = process.env.REVIEW_ORIGIN ?? "http://127.0.0.1:15218",
  output = process.env.REVIEW_OUTPUT ?? "output/predictor/browser";
const env = await fs.readFile(".env", "utf8"),
  password = env
    .split(/\r?\n/)
    .find((l) => l.startsWith("DEV_LOCAL_AUTH_PASSWORD="))
    ?.split("=")
    .slice(1)
    .join("=")
    .trim();
assert.ok(password);
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
});
const evidence = {
  source: process.env.REVIEW_FIXTURE
    ? "Candidate with real DB read snapshot; synthetic interaction phase labelled separately"
    : "Deployed authenticated API",
  errors: [],
  screenshots: [],
  mutations: [],
  status: "NOT_RUN",
};
try {
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  });
  assert.ok(
    (
      await context.request.post(
        "http://127.0.0.1:19090/n50/auth/session/dev-login",
        { data: { identifier: "admin", password } },
      )
    ).ok(),
  );
  const cookie = (await context.storageState()).cookies.find((c) =>
    c.name.includes("session"),
  );
  if (cookie)
    await context.addCookies([
      {
        ...cookie,
        domain: "127.0.0.1",
        path: "/",
        secure: false,
        sameSite: "Lax",
      },
    ]);
  const page = await context.newPage();
  page.on("pageerror", (e) => evidence.errors.push(String(e)));
  page.on("request", (r) => {
    if (r.url().includes("/v1/predictor") && r.method() !== "GET")
      evidence.mutations.push(r.method());
  });
  let data;
  if (process.env.REVIEW_FIXTURE) {
    data = JSON.parse(await fs.readFile(process.env.REVIEW_FIXTURE, "utf8"));
    await page.route("**/v1/predictor*", (r) => r.fulfill({ json: data }));
  }
  await page.goto(`${origin}/n50/predictor`);
  const root = page.getByTestId("predictor-dashboard");
  await root
    .getByRole("heading", { name: "Possible closing levels" })
    .waitFor({ timeout: 90000 });
  await page
    .getByRole("navigation", { name: "Primary navigation", exact: true })
    .getByRole("link", { name: "Predictor", exact: true })
    .waitFor();
  if (!data) {
    const response = await page.request.get(`${origin}/n50/v1/predictor`);
    assert.ok(response.ok());
    data = await response.json();
    assert.equal(
      (await page.request.get(`${origin}/n50/v1/predictor?day=bad`)).status(),
      400,
    );
  }
  evidence.studySymbols = data.studies.map((s) => s.symbol);
  evidence.liveForecasts = data.forecasts.length;
  for (const name of [
    "EOD scorecard",
    "Historical lab",
    "Models & eligibility",
    "Forecasts",
  ]) {
    await root.getByRole("button", { name, exact: true }).click();
    await page.waitForTimeout(150);
  }
  await root
    .getByRole("button", { name: "Historical lab", exact: true })
    .click();
  assert.ok((await root.locator("tbody tr").count()) === 3);
  await root.getByLabel("Morning conditions").selectOption({ index: 1 });
  await root.getByLabel("Morning conditions").selectOption("ALL");
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(400);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 2,
      ),
      "Contained page width",
    );
    const file = `${output}/historical-${viewport.width}.png`;
    await page.screenshot({ path: file, fullPage: true });
    evidence.screenshots.push(file);
  }
  for (const name of ["Export CSV", "Export JSON"]) {
    const download = page.waitForEvent("download");
    await root.getByRole("button", { name, exact: true }).click();
    assert.ok((await download).suggestedFilename().startsWith("predictor-"));
  }
  // Explicit synthetic fixtures for forecast/score/inspector branches; no source/API writes.
  const fixture = {
    ...data,
    forecasts: ["no-change", "ridge", "similar-days"].map((model, i) => ({
      id: String(i + 1),
      day: data.selectedDay,
      symbol: "SYNTHETIC",
      model,
      version: "fixture",
      published_at: "2026-09-18T04:05:00Z",
      source_at: "2026-09-18T04:03:00Z",
      target_at: "2026-09-18T10:00:00Z",
      payload: {
        reference: 100,
        open: 99,
        predicted: 100 + i,
        low: 95,
        high: 105,
        probabilityAboveReference: 0.6,
        sampleCount: 200,
        trainedThrough: "2026-09-17",
        condition: "Rising trend",
        eligibility: { route: "M−1" },
      },
      outcome: {
        actual: 102,
        absoluteErrorPct: Math.abs(2 - i),
        directionCorrect: i > 0,
        covered: true,
        brier: 0.16,
      },
    })),
  };
  await page.route("**/v1/predictor/evidence/*", (r) =>
    r.fulfill({ json: { synthetic: true, inputs: "test" } }),
  );
  await page.route(/\/v1\/predictor(?:\?.*)?$/, (r) =>
    r.fulfill({ json: fixture }),
  );
  await root.getByRole("button", { name: "Refresh", exact: true }).click();
  await root.getByRole("button", { name: "Forecasts", exact: true }).click();
  await root.getByRole("button", { name: "Inspect inputs" }).first().waitFor();
  assert.equal(await root.locator("tbody tr").count(), 3);
  await root.getByRole("button", { name: "Inspect inputs" }).first().click();
  await root
    .getByRole("heading", { name: "Saved forecast evidence" })
    .waitFor();
  await root.getByRole("button", { name: "Close evidence" }).click();
  await root
    .getByRole("button", { name: "EOD scorecard", exact: true })
    .click();
  assert.ok(
    (
      await root.locator("tbody").first().locator("tr").first().innerText()
    ).includes("Similar-day matching"),
  );
  await page.setViewportSize({ width: 1920, height: 1080 });
  await root.getByRole("button", { name: "Forecasts", exact: true }).click();
  await page.screenshot({
    path: `${output}/synthetic-forecasts.png`,
    fullPage: true,
  });
  evidence.syntheticInteractions =
    "PASS: forecasts, range glyphs, matched EOD ranking, inspector";
  assert.equal(evidence.errors.length, 0);
  assert.equal(evidence.mutations.length, 0);
  evidence.status = "PASS";
} catch (e) {
  evidence.status = "FAIL";
  evidence.failure = String(e);
  process.exitCode = 1;
} finally {
  await browser.close();
  await fs.writeFile(
    `${output}/results.json`,
    JSON.stringify(evidence, null, 2),
  );
}
console.log(JSON.stringify(evidence));
