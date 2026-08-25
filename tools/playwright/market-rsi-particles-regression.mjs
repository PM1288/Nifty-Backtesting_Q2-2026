import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const origin = (process.env.PLAYWRIGHT_ORIGIN ?? "http://127.0.0.1:19090").replace(/\/$/, "");
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
const outputDir = path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR ?? "output/playwright/market-rsi-particles-20260818");
if (!password) throw new Error("PLAYWRIGHT_ADMIN_PASSWORD is required.");
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const results = [];
const check = (name, passed, detail = "") => {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}: ${detail}`);
};

try {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const login = await context.request.post(`${origin}/auth/session/dev-login`, { data: { identifier: "admin", password } });
  check("admin login", login.ok(), `status=${login.status()}`);
  const page = await context.newPage();
  await page.goto(`${origin}/n50/?prefetch=off`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const particles = page.locator("canvas[data-market-rsi-particles='true']");
  await particles.waitFor({ state: "visible", timeout: 60_000 });
  const state = await particles.evaluate((canvas) => ({
    count: Number(canvas.dataset.particleCount),
    speed: Number(canvas.dataset.particleSpeed),
    colour: canvas.dataset.particleColour,
    tone: canvas.dataset.particleTone,
    rsi: canvas.dataset.niftyRsi,
  }));
  check("particle contract is mounted", state.count === 400 && state.speed >= 0.8 && state.speed <= 1.8 && /^#[0-9a-f]{6}$/i.test(state.colour ?? ""), JSON.stringify(state));

  const sample = async () => particles.evaluate((canvas) => {
    const context = canvas.getContext("2d");
    if (!context) return null;
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    let pixels = 0, signature = 0;
    for (let index = 0; index < image.data.length; index += 16) {
      const alpha = image.data[index + 3];
      if (alpha > 3) pixels += 1;
      signature = (signature + alpha * ((index / 4) % 997)) % 2147483647;
    }
    return { pixels, signature };
  });
  const first = await sample();
  await page.waitForTimeout(350);
  const second = await sample();
  check("particles render and move", Boolean(first && second && first.pixels > 100 && second.pixels > 100 && first.signature !== second.signature), JSON.stringify({ first, second }));
  await page.screenshot({ path: path.join(outputDir, "home-rsi-particles-1366x768.png") });

  await page.getByRole("link", { name: "Paper Trading", exact: true }).click();
  await page.waitForURL(/\/n50\/paper-trading/);
  check("shared background survives dashboard navigation", await particles.count() === 1 && await particles.getAttribute("data-particle-count") === "400", "particle canvas was lost after navigation");
  await page.screenshot({ path: path.join(outputDir, "paper-dashboard-rsi-particles-1366x768.png") });

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForTimeout(100);
  check("reduced motion hides particles", await particles.evaluate((canvas) => getComputedStyle(canvas).display === "none"), "particle motion remains visible");
  await context.close();
} finally {
  await browser.close();
  await fs.writeFile(path.join(outputDir, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
}

console.log(JSON.stringify({ checks: results.length, passed: results.filter((item) => item.passed).length, outputDir }, null, 2));
