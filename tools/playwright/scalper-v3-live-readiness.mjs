import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const base = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:19090/n50";
const expiry = process.env.SCALPER_TEST_EXPIRY ?? "2026-09-22";
const strike = process.env.SCALPER_TEST_STRIKE ?? "23350";
const output = process.env.PLAYWRIGHT_OUTPUT_DIR
  ?? "/home/novius2/NIFTY50/evidence/scalper-v3-live-readiness-20260922";
const env = await fs.readFile(".env", "utf8");
const password = env.split(/\r?\n/)
  .find((line) => line.startsWith("DEV_LOCAL_AUTH_PASSWORD="))
  ?.split("=").slice(1).join("=").trim().replace(/^[\"']|[\"']$/g, "");
assert(password, "Protected dev-login password is required");
await fs.mkdir(output, { recursive: true });

const route = `${base}/strategy/trading-analytics?view=scalper_v3&interval=5&expiry=${expiry}&ceStrike=${strike}&peStrike=${strike}`;
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const origin = new URL(base).origin;
  const login = await context.request.post(`${base}/auth/session/dev-login`, {
    headers: { Origin: origin },
    data: { identifier: "admin", password },
  });
  assert(login.ok(), `Protected login failed: ${login.status()}`);

  const page = await context.newPage();
  const errors = [];
  const chartRequests = [];
  const requestStartedAt = new Map();
  const responseTimingsMs = [];
  let documents = 0;
  let mutateNextChartResponse = false;
  let mutatedResponses = 0;
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("request", (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documents += 1;
    if (request.url().includes("/v1/trading-analytics/charts?")) {
      const at = Date.now();
      chartRequests.push({ at, url: request.url() });
      requestStartedAt.set(request, at);
    }
  });
  page.on("requestfinished", (request) => {
    const startedAt = requestStartedAt.get(request);
    if (startedAt != null) responseTimingsMs.push(Date.now() - startedAt);
  });
  await page.route("**/v1/trading-analytics/charts?*", async (requestRoute) => {
    const response = await requestRoute.fetch();
    const payload = await response.json();
    if (mutateNextChartResponse) {
      for (const pane of payload.panes ?? []) {
        const last = pane.bars?.at(-1);
        if (!last) continue;
        const nextClose = Number(last.close) + 0.25;
        last.close = nextClose;
        last.high = Math.max(Number(last.high), nextClose);
      }
      mutatedResponses += 1;
    }
    await requestRoute.fulfill({ response, json: payload });
  });

  await page.goto(route, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.getByTestId("scalper-v3").waitFor({ timeout: 120_000 });
  await page.getByTestId("v2-chart-host-put").waitFor({ timeout: 120_000 });
  await page.waitForTimeout(2_000);
  const before = await page.evaluate(() => {
    const hosts = [...document.querySelectorAll('[data-testid^="v2-chart-host-"]')];
    window.__v3NativeRoots = hosts.map((host) => host.querySelector(".tv-lightweight-charts"));
    return hosts.map((host) => ({
      id: host.dataset.testid,
      setData: Number(host.dataset.setDataCount ?? 0),
      update: Number(host.dataset.updateCount ?? 0),
    }));
  });
  assert.equal(before.length, 3, "Three price panes must hydrate");
  assert(before.every((row) => row.setData > 0), JSON.stringify(before));

  const requestCountBeforeMutation = chartRequests.length;
  mutateNextChartResponse = true;
  await page.waitForFunction(
    (previous) => performance.getEntriesByType("resource")
      .filter((entry) => entry.name.includes("/v1/trading-analytics/charts?")).length > previous,
    requestCountBeforeMutation,
    { timeout: 30_000 },
  );
  await page.waitForTimeout(1_500);
  const after = await page.evaluate(() => {
    const hosts = [...document.querySelectorAll('[data-testid^="v2-chart-host-"]')];
    return {
      operations: hosts.map((host) => ({
        id: host.dataset.testid,
        setData: Number(host.dataset.setDataCount ?? 0),
        update: Number(host.dataset.updateCount ?? 0),
      })),
      sameRoots: window.__v3NativeRoots.length === 3
        && window.__v3NativeRoots.every((root) => root?.isConnected)
        && hosts.every((host, index) => host.querySelector(".tv-lightweight-charts") === window.__v3NativeRoots[index]),
      nativeRoots: document.querySelectorAll('[data-testid^="v2-chart-host-"] .tv-lightweight-charts').length,
      feedState: document.querySelector('[data-testid="scalper-v3"]')?.getAttribute("data-v3-feed"),
    };
  });
  assert(mutatedResponses > 0, "A polled response must be mutated by the recorded-data fixture");
  assert.equal(documents, 1, "Polling must not reload the document");
  assert(after.sameRoots && after.nativeRoots === 3, JSON.stringify(after));
  assert(after.operations.every((row, index) => row.setData === before[index].setData), JSON.stringify({ before, after }));
  assert(after.operations.every((row, index) => row.update > before[index].update), JSON.stringify({ before, after }));
  assert.equal(errors.length, 0, JSON.stringify(errors));

  await page.screenshot({ path: path.join(output, "scalper-v3-recorded-live-update.png"), fullPage: false });
  const result = {
    route,
    recordedFixture: { expiry, strike, note: "Existing production-recorded session bars; the test changes only the latest response in-browser and does not write market data." },
    documents,
    chartRequests: chartRequests.length,
    responseTimingsMs,
    mutatedResponses,
    before,
    after,
    errors,
    status: "PASS",
  };
  await fs.writeFile(path.join(output, "results.json"), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
