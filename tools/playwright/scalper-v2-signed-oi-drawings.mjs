import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const base = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:15184/n50";
const authBase = process.env.PLAYWRIGHT_AUTH_BASE_URL ?? base;
const output = process.env.PLAYWRIGHT_OUTPUT_DIR ?? "/tmp/scalper-v2-signed-oi-drawings";
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
  const login = await context.request.post(`${authBase}/auth/session/dev-login`, { data: { identifier: "admin", password }, headers: { Origin: new URL(base).origin } });
  check("Authenticated isolated candidate", login.ok(), `HTTP ${login.status()}`);
  // The production environment emits a Secure session cookie. This candidate
  // is loopback HTTP only, so clone that same session cookie without Secure.
  const setCookie = login.headers()["set-cookie"] ?? "";
  const sessionPair = setCookie.split(";", 1)[0];
  const separator = sessionPair.indexOf("=");
  if (separator > 0) await context.addCookies([{
    name: sessionPair.slice(0, separator), value: sessionPair.slice(separator + 1),
    domain: "127.0.0.1", path: "/", httpOnly: true, secure: false, sameSite: "Lax",
  }]);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(`${base}/strategy/trading-analytics?view=scalper_v2&interval=5`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.getByTestId("scalper-v2").waitFor({ state: "visible", timeout: 30_000 }).catch(async () => {
    throw new Error(`Scalper V2 did not mount: ${JSON.stringify({ url: page.url(), body: (await page.locator("body").innerText()).slice(0, 2_000), errors })}`);
  });

  const profile = page.getByTestId("v2-oi-profile");
  await profile.waitFor({ state: "visible" });
  const caption = await profile.innerText();
  check("Profile scale is visible above chart", caption.includes("← 0 →") && caption.includes("shared maximum"), caption);
  check("Profile identity legend is visible", caption.includes("CE") && caption.includes("PE"), caption);

  const body = page.getByTestId("v2-chart-body-underlying");
  await page.waitForTimeout(1_000);
  const geometry = await body.evaluate((element) => ({
    anchor: Number(element.dataset.profileAnchorX),
    maximum: Number(element.dataset.profileMaximum),
    rows: JSON.parse(element.dataset.profileGeometry ?? "[]"),
  }));
  const positive = geometry.rows.filter((row) => Number(row.value) > 0);
  const negative = geometry.rows.filter((row) => Number(row.value) < 0);
  check("Profile uses one positive and negative zero origin", positive.length > 0 && negative.length > 0 && positive.every((row) => row.startX === geometry.anchor && row.endX > geometry.anchor) && negative.every((row) => row.startX < geometry.anchor && row.endX === geometry.anchor), JSON.stringify({ anchor: geometry.anchor, positive: positive.length, negative: negative.length }));
  check("Profile reports a positive shared absolute maximum", geometry.maximum > 0, JSON.stringify(geometry));

  const now = new Date().toISOString();
  await page.evaluate(({ now }) => localStorage.setItem("trading-analytics:scalper-v2:drawings:v1:default:NIFTY", JSON.stringify([{
    id: "browser-clear-drawing", tool: "horizontal_line", paneRole: "underlying", instrumentId: "NIFTY", anchors: [{ time: 1789005600, price: 23450 }],
    style: { color: "#6651d9", lineWidth: 2, lineStyle: "solid", fillOpacity: 0.12 }, text: "browser clear test", visible: true, locked: false, createdAt: now, updatedAt: now,
  }])), { now });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByTestId("scalper-v2").waitFor({ state: "visible", timeout: 90_000 });
  await page.getByRole("tab", { name: "Objects" }).click();
  const clear = page.getByTestId("v2-clear-drawings");
  check("Clear all drawings is enabled for saved objects", await clear.isEnabled(), await page.getByTestId("v2-drawing-objects").innerText());
  await clear.click();
  check("Clear removes every drawing", await clear.isDisabled() && (await page.getByTestId("v2-drawing-objects").innerText()).includes("No saved drawings"), await page.getByTestId("v2-drawing-objects").innerText());
  await page.getByRole("button", { name: "Undo drawing", exact: true }).click();
  check("Undo restores cleared drawings", await clear.isEnabled(), await page.getByTestId("v2-drawing-objects").innerText());
  check("No browser errors", errors.length === 0, errors.join(" | "));
  await page.screenshot({ path: path.join(output, "scalper-v2-signed-oi-and-clear.png"), fullPage: true });
} finally {
  await browser.close();
  await fs.writeFile(path.join(output, "results.json"), JSON.stringify(results, null, 2));
}
console.log(JSON.stringify({ passed: results.filter((result) => result.status === "PASS").length, total: results.length, output }));
