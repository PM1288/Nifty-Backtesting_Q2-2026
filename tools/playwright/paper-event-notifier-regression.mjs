import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const origin = (process.env.PLAYWRIGHT_ORIGIN ?? "http://127.0.0.1:19090").replace(/\/$/, "");
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
const outputDir = path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR ?? "output/paper-event-notifier");
if (!password) throw new Error("PLAYWRIGHT_ADMIN_PASSWORD is required.");

await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
const check = (name, passed, detail = "") => {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}: ${detail}`);
};
const authenticatedContext = async (viewport) => {
  const context = await browser.newContext({ viewport });
  const login = await context.request.post(`${origin}/n50/auth/session/dev-login`, { data: { identifier: "admin", password } });
  check(`login ${viewport.width}`, login.ok(), `status=${login.status()}`);
  return context;
};

try {
  const desktop = await authenticatedContext({ width: 1440, height: 900 });
  const api = await desktop.request.get(`${origin}/n50/v1/paper/notifications?limit=5`);
  check("authenticated paper alert API", api.ok(), `status=${api.status()}`);
  const payload = await api.json();
  check("durable event source", payload.source === "paper_trading.trade_events", payload.source);
  check("latest five cap", payload.items.length > 0 && payload.items.length <= 5, `items=${payload.items.length}`);
  check("entry or target only", payload.items.every((item) => ["ENTRY", "TARGET_HIT"].includes(item.kind)), JSON.stringify(payload.items.map((item) => item.kind)));
  const page = await desktop.newPage();
  await page.goto(`${origin}/n50/analytics`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  const launcher = page.getByRole("button", { name: /Paper trade notifications/ });
  await launcher.waitFor({ state: "visible", timeout: 60_000 });
  check("header defaults muted", await page.getByRole("button", { name: "Speak paper trade entry and exit conditions" }).count() === 1);
  check("launcher is compact", await launcher.evaluate((node) => node.getBoundingClientRect().width === 42));
  await launcher.click();
  const panel = page.getByRole("region", { name: "Latest five paper trade notifications" });
  await panel.waitFor({ state: "visible" });
  check("panel exposes at most five", await panel.locator("time").count() <= 5);
  check("timestamps use IST", await panel.locator("time").first().innerText().then((value) => value.endsWith("IST")));
  await page.screenshot({ path: path.join(outputDir, "paper-alerts-desktop.png") });
  await page.keyboard.press("Escape");
  check("Escape closes", await panel.count() === 0);
  await desktop.close();

  const simulated = await authenticatedContext({ width: 1366, height: 768 });
  await simulated.addInitScript(() => {
    window.__n50Spoken = [];
    class TestUtterance { constructor(text) { this.text = text; } }
    Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: TestUtterance });
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: {
      speak: (utterance) => window.__n50Spoken.push(utterance.text),
      cancel: () => window.__n50Spoken.push("CANCELLED"),
      getVoices: () => [],
    } });
  });
  let calls = 0;
  await simulated.route("**/n50/v1/paper/notifications?limit=5", async (route) => {
    calls += 1;
    const items = [...payload.items];
    if (calls > 1) items.unshift({
      id: "regression-new-target", eventType: "com.papertrading.target_track.closed.v1", kind: "TARGET_HIT",
      title: "ANALYTICAL TARGET HIT", body: "Regression-only browser response; production data was not changed.",
      symbol: "RELIANCE", occurredAt: new Date().toISOString(), tradeId: "regression-only",
      deepLink: "/paper-trading?tradeId=regression-only&source=paper-alert",
      speechText: "Paper trade target condition hit for RELIANCE. Higher analytical targets remain active.",
    });
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...payload, items: items.slice(0, 5) }) });
  });
  const autoPage = await simulated.newPage();
  await autoPage.goto(`${origin}/n50/`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await autoPage.getByRole("button", { name: "Speak paper trade entry and exit conditions" }).click();
  await autoPage.getByRole("button", { name: /Paper trade notifications/ }).click();
  await autoPage.keyboard.press("Escape");
  await autoPage.getByRole("region", { name: "Latest five paper trade notifications" }).waitFor({ state: "visible", timeout: 12_000 });
  check("new event auto-opens", await autoPage.getByText("Regression-only browser response", { exact: false }).count() === 1, `pollCalls=${calls}`);
  check("native speech receives event", await autoPage.evaluate(() => window.__n50Spoken.some((text) => text.includes("target condition hit for RELIANCE"))));
  await autoPage.getByRole("button", { name: "Mute paper trade voice alerts" }).click();
  check("mute cancels speech", await autoPage.evaluate(() => window.__n50Spoken.at(-1) === "CANCELLED"));
  await simulated.close();

  const mobile = await authenticatedContext({ width: 390, height: 844 });
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(`${origin}/n50/analytics`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  const mobileLauncher = mobilePage.getByRole("button", { name: /Paper trade notifications/ });
  await mobileLauncher.waitFor({ state: "visible", timeout: 60_000 });
  const box = await mobileLauncher.boundingBox();
  check("mobile clears bottom navigation", Boolean(box && box.y + box.height < 774), JSON.stringify(box));
  await mobileLauncher.click();
  check("mobile has no horizontal overflow", await mobilePage.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await mobilePage.screenshot({ path: path.join(outputDir, "paper-alerts-mobile.png") });
  await mobile.close();
} finally {
  await browser.close();
  await fs.writeFile(path.join(outputDir, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
}

console.log(JSON.stringify({ checks: results.length, passed: results.filter((item) => item.passed).length, outputDir }, null, 2));
