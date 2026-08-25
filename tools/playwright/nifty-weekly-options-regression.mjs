import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = (process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:19090/n50").replace(/\/$/, "");
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
const outputDir = path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR ?? "output/playwright/nifty-weekly-options");
if (!password) throw new Error("PLAYWRIGHT_ADMIN_PASSWORD is required");

await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];

function check(viewport, name, passed, detail = "") {
  results.push({ viewport, name, passed, detail });
  if (!passed) throw new Error(`${viewport} ${name}: ${detail}`);
}

try {
  for (const viewport of [
    { name: "desktop-1920x1080", width: 1920, height: 1080 },
    { name: "mobile-390x844", width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
    const login = await context.request.post(`${baseUrl}/auth/session/dev-login`, { data: { identifier: "admin", password } });
    check(viewport.name, "authenticated login", login.ok(), `status=${login.status()}`);

    const page = await context.newPage();
    const errors = [];
    page.on("console", (message) => {
      if (message.type() === "error" && !/cloudflareinsights|clarity/i.test(message.text())) errors.push(message.text());
    });
    await page.goto(`${baseUrl}/strategy/nifty-options`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.getByRole("heading", { name: "NIFTY Weekly & Monthly Options", exact: true }).waitFor();

    const payloads = await page.evaluate(async ({ niftyUrl, stockUrl }) => {
      const [nifty, stock] = await Promise.all([fetch(niftyUrl, { credentials: "include" }), fetch(stockUrl, { credentials: "include" })]);
      return { nifty: { status: nifty.status, body: await nifty.json() }, stock: { status: stock.status, body: await stock.json() } };
    }, { niftyUrl: `${baseUrl}/v1/nifty-options/summary`, stockUrl: `${baseUrl}/v1/long-options/summary` });

    const nifty = payloads.nifty.body;
    check(viewport.name, "NIFTY options summary API", payloads.nifty.status === 200, `status=${payloads.nifty.status}`);
    check(viewport.name, "independent NIFTY identity", nifty.strategyFamily === "NIFTY_WEEKLY_MONTHLY_LONG_OPTIONS", String(nifty.strategyFamily));
    check(viewport.name, "shadow safety boundary", nifty.environment === "SHADOW_NO_TRADE" && nifty.liveOrdersEnabled === false && nifty.paperSubmissionEnabled === false, JSON.stringify(nifty.safety));
    check(
      viewport.name,
      "W0 and M0 are independently resolved",
      Boolean(
        nifty.expiryRegistry?.W0 &&
        nifty.expiryRegistry?.M0 &&
        (nifty.expiryRegistry.W0 !== nifty.expiryRegistry.M0 || nifty.expiryRegistry.alsoNearestWeekly === true)
      ),
      JSON.stringify(nifty.expiryRegistry),
    );
    for (const [role, surface] of [["W0", nifty.weekly], ["M0", nifty.monthly]]) {
      check(viewport.name, `${role} chain captured`, surface?.snapshot?.expiryDate && surface.snapshot.spot > 0, JSON.stringify(surface?.snapshot));
      check(viewport.name, `${role} effective lot`, surface?.snapshot?.lotSize === 65, `lot=${surface?.snapshot?.lotSize}`);
      check(viewport.name, `${role} two-sided chain`, surface?.snapshot?.totalLegCount >= 20 && surface.snapshot.twoSidedLegCount === surface.snapshot.totalLegCount, JSON.stringify(surface?.snapshot));
      check(viewport.name, `${role} structures fail closed`, surface?.structures?.length === 2 && surface.structures.every((item) => item.hardGateFailures.includes("TARGET_PROBABILITY_NOT_CALIBRATED") && item.decision === "NO_TRADE"), JSON.stringify(surface?.structures));
    }
    check(viewport.name, "scores are not fabricated", ["DQS","MRS","LCS","DES","VES","CQS","ECS","TFS","FRS"].every((key) => nifty.scorecard[key] === null), JSON.stringify(nifty.scorecard));
    check(viewport.name, "paper book is isolated", nifty.paperBook?.state === "NOT_CONNECTED" && nifty.paperBook?.groups?.length === 0, JSON.stringify(nifty.paperBook));
    check(viewport.name, "no paper or live action", await page.getByRole("button", { name: /place order|submit order|execute trade|add paper trade/i }).count() === 0, "unexpected economic action rendered");
    check(viewport.name, "stock router full universe", payloads.stock.status === 200 && payloads.stock.body.summary?.fullFnoUniverse >= 180, JSON.stringify(payloads.stock.body.summary));
    check(viewport.name, "stock router funnel explains five", payloads.stock.body.summary?.premarketShortlist >= payloads.stock.body.summary?.liveShortlist && payloads.stock.body.summary?.liveShortlist === 5, JSON.stringify(payloads.stock.body.summary));
    for (const tab of ["Weekly", "Monthly", "Chain & Surface", "Paper Book", "Validation & Health", "Command Centre"]) {
      await page.getByRole("button", { name: tab, exact: true }).first().click();
      check(viewport.name, `${tab} tab opens`, await page.getByRole("button", { name: tab, exact: true }).first().getAttribute("data-active") === "true", "tab inactive");
    }
    check(viewport.name, "no horizontal overflow", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `scrollWidth=${await page.evaluate(() => document.documentElement.scrollWidth)}`);
    check(viewport.name, "console clean", errors.length === 0, errors.join(" | "));

    if (viewport.width > 720) {
      const strategyLink = page.getByRole("navigation", { name: "Workspace navigation" }).getByRole("link", { name: /Strategy/ }).first();
      await strategyLink.hover();
      const menu = page.getByRole("menu", { name: "Strategy dashboards" });
      await menu.waitFor();
      check(viewport.name, "NIFTY Options menu entry", await menu.getByText("NIFTY Options", { exact: true }).count() === 1, "menu entry missing");
    }

    await page.screenshot({ path: path.join(outputDir, `${viewport.name}.png`), fullPage: true });
    await context.close();
  }
} finally {
  await browser.close();
  await fs.writeFile(path.join(outputDir, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
}

console.log(JSON.stringify({ checks: results.length, passed: results.filter((result) => result.passed).length, outputDir }, null, 2));
