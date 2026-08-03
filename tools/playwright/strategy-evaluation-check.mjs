import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.N50_BASE_URL ?? "http://localhost:19090/n50";
const targetUrl = `${baseUrl}/strategy/evaluation`;
const outputDir = path.resolve(process.cwd(), "output/playwright");
const screenshotPath = path.join(outputDir, "strategy-evaluation-page.png");
const summaryPath = path.join(outputDir, "strategy-evaluation-page.json");
const email = process.env.N50_TEST_EMAIL;
const password = process.env.N50_TEST_PASSWORD;

async function dismissIfVisible(page, label) {
  const candidate = page.getByRole("button", { name: label });
  if (await candidate.count()) {
    const first = candidate.first();
    if (await first.isVisible().catch(() => false)) {
      await first.click();
      return true;
    }
  }
  return false;
}

async function signInIfNeeded(page) {
  const signInButton = page.getByRole("button", { name: /^sign in$/i });
  if (!(await signInButton.count())) return false;
  if (!(await signInButton.first().isVisible().catch(() => false))) return false;
  if (!email || !password) {
    throw new Error("N50_TEST_EMAIL and N50_TEST_PASSWORD are required when the page needs authentication");
  }

  await signInButton.first().click();
  const modeButton = page
    .locator('[role="dialog"], [aria-modal="true"]')
    .getByRole("button", { name: /^log in$/i })
    .first();
  await modeButton.click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  const submitButton = page.locator("form").getByRole("button", { name: /^log in$/i });
  await submitButton.click();
  await page.waitForLoadState("networkidle");
  return true;
}

function cleanText(items) {
  return items.map((value) => value.trim()).filter(Boolean);
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1400 } });
  const page = await context.newPage();

  try {
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(2_000);

    await dismissIfVisible(page, "Continue as guest");
    await dismissIfVisible(page, "Not now");
    await signInIfNeeded(page);
    await page.goto(targetUrl, { waitUntil: "networkidle", timeout: 60_000 });
    await page.waitForTimeout(2_000);

    const heading = page.getByRole("heading", { name: /strategy evaluation/i });
    await heading.waitFor({ state: "visible", timeout: 30_000 });

    const chartTitles = [
      "score decomposition",
      "forward return by action and direction",
      "hit-rate by signal family",
      "equity curve vs benchmark",
      "drawdown curve",
      "performance by regime",
      "sector contribution"
    ];

    for (const title of chartTitles) {
      await page.getByRole("heading", { name: new RegExp(title, "i") }).waitFor({
        state: "visible",
        timeout: 20_000
      });
    }

    const chartCount = await page.locator("canvas").count();
    const sidebarLabels = cleanText(await page.locator("nav").first().getByText(/Strategy|Strategy Evaluation|Market|Backtesting/).allTextContents());
    const subTabLabels = cleanText(await page.getByRole("link").filter({ hasText: /Strategy Evaluation|Backtesting Overview|Compare|Runs/ }).allTextContents());
    const authLabels = cleanText(await page.locator("body").getByText(/ESNG Admin|Connected/).allTextContents());

    await page.screenshot({ path: screenshotPath, fullPage: true });

    const summary = {
      url: targetUrl,
      title: await page.title(),
      chartCount,
      chartTitles,
      sidebarLabels,
      subTabLabels,
      authLabels
    };

    await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), "utf8");
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
