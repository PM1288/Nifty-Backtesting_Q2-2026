import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const base = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:15184/n50";
const authBase = process.env.PLAYWRIGHT_AUTH_BASE_URL ?? base;
const authOrigin = process.env.PLAYWRIGHT_AUTH_ORIGIN ?? new URL(base).origin;
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
  const login = await context.request.post(`${authBase}/auth/session/dev-login`, { data: { identifier: "admin", password }, headers: { Origin: authOrigin } });
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
  const body = page.getByTestId("v2-chart-body-underlying");
  await profile.waitFor({ state: "visible" });
  const caption = await profile.innerText();
  check("Profile scale is visible above chart", caption.includes("← 0 →") && caption.includes("shared maximum"), caption);
  check("Profile identity legend declares blue CE and yellow PE", caption.includes("CE blue") && caption.includes("PE yellow") && caption.includes("− left · + right"), caption);
  const maxPainStatus = page.getByTestId("v2-max-pain-chart-status");
  await maxPainStatus.waitFor({ state: "visible" });
  const initialMaxPain = await maxPainStatus.innerText();
  check("Underlying chart declares snapshot max pain", /^Max pain [\d,]+/.test(initialMaxPain), initialMaxPain);

  const allStrikesY = page.getByRole("button", { name: "All strikes Y", exact: true });
  if ((await body.getAttribute("data-max-pain-visible")) === "") {
    await allStrikesY.click();
    await page.waitForFunction(() => {
      const element = document.querySelector('[data-testid="v2-chart-body-underlying"]');
      return Boolean(element?.getAttribute("data-max-pain-visible"));
    });
  }
  const plottedMaxPain = await body.evaluate((element) => ({
    candidates: element.dataset.maxPainStrikes ?? "",
    visible: element.dataset.maxPainVisible ?? "",
    status: element.dataset.maxPainStatus ?? "",
  }));
  check("Underlying chart plots max pain in an eligible Y view", plottedMaxPain.status === "plotted" && plottedMaxPain.visible === plottedMaxPain.candidates, JSON.stringify(plottedMaxPain));

  const oiCardText = await page.getByRole("heading", { name: "OI by strike", exact: true }).locator("..").innerText();
  const deltaOiCardText = await page.getByRole("heading", { name: /^Change in OI by strike/ }).locator("..").innerText();
  const payoutCardText = await page.getByRole("heading", { name: "Max-pain payout distribution", exact: true }).locator("..").innerText();
  check("OI chart declares dotted NIFTY current guide", oiCardText.includes("dotted NIFTY current") && oiCardText.includes("nearest strike"), oiCardText);
  check("Delta OI chart declares strike-axis NIFTY current guide", deltaOiCardText.includes("dotted NIFTY current") && deltaOiCardText.includes("nearest strike"), deltaOiCardText);
  check("Delta OI chart declares blue CE and yellow PE fills", deltaOiCardText.includes("CE blue · PE yellow") && deltaOiCardText.includes("negative extends left · positive extends right"), deltaOiCardText);
  check("Max-pain chart declares dotted NIFTY current guide", payoutCardText.includes("dotted NIFTY current") && payoutCardText.includes("nearest settlement strike"), payoutCardText);

  const cumulativeOi = page.getByTestId("v2-cumulative-oi-time");
  await cumulativeOi.waitFor({ state: "visible" });
  const cumulativeText = await cumulativeOi.innerText();
  check("Cumulative OI chart declares timestamp and summed-strike scope", cumulativeText.includes("Cumulative OI vs timestamp") && cumulativeText.includes("all strikes captured") && cumulativeText.includes("not a running total across time"), cumulativeText);
  check("Cumulative OI chart exposes CE and PE identity", cumulativeText.includes("blue CE / yellow PE"), cumulativeText);
  check("Cumulative OI chart renders retained history", !cumulativeText.includes("OI history unavailable") && await cumulativeOi.locator("canvas").count() > 0, cumulativeText);

  const normalizedPrice = page.getByTestId("v2-normalized-option-price");
  await normalizedPrice.waitFor({ state: "visible" });
  const normalizedText = await normalizedPrice.innerText();
  check("Normalized option chart declares exact scale", normalizedText.includes("first retained session price = 0") && normalizedText.includes("observed high = +100") && normalizedText.includes("observed low = −100"), normalizedText);
  check("Normalized option chart declares distance opacity", normalizedText.includes("fully opaque") && normalizedText.includes("farther strikes fade progressively"), normalizedText);
  check("Normalized option chart renders retained CE and PE history", !normalizedText.includes("Option price history unavailable") && /\d+ CE\/PE strike lines/.test(normalizedText) && await normalizedPrice.locator("canvas").count() > 0, normalizedText);

  // Session Y intentionally clips strikes outside the observed underlying
  // range. Inspect the complete cohort before asserting that both signs use
  // the shared zero origin.
  if (await allStrikesY.isVisible()) {
    await allStrikesY.click();
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(1_000);
  const geometry = await body.evaluate((element) => ({
    anchor: Number(element.dataset.profileAnchorX),
    maximum: Number(element.dataset.profileMaximum),
    rows: JSON.parse(element.dataset.profileGeometry ?? "[]"),
  }));
  const positive = geometry.rows.filter((row) => Number(row.value) > 0);
  const negative = geometry.rows.filter((row) => Number(row.value) < 0);
  check("Profile uses the shared signed zero origin for every observed side", positive.length + negative.length > 0 && positive.every((row) => row.startX === geometry.anchor && row.endX > geometry.anchor) && negative.every((row) => row.startX < geometry.anchor && row.endX === geometry.anchor), JSON.stringify({ anchor: geometry.anchor, positive: positive.length, negative: negative.length }));
  check("Profile reports a positive shared absolute maximum", geometry.maximum > 0, JSON.stringify(geometry));
  await page.getByTestId("v2-deltaoi-chart").screenshot({ path: path.join(output, "scalper-v2-delta-oi-blue-ce-yellow-pe.png") });

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
  await page.screenshot({ path: path.join(output, "scalper-v2-nifty-guides-signed-oi-and-clear.png"), fullPage: true });
} finally {
  await browser.close();
  await fs.writeFile(path.join(output, "results.json"), JSON.stringify(results, null, 2));
}
console.log(JSON.stringify({ passed: results.filter((result) => result.status === "PASS").length, total: results.length, output }));
