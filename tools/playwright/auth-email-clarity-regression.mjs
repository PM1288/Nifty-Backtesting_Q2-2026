import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const origin = (process.env.PLAYWRIGHT_ORIGIN ?? "http://127.0.0.1:19090").replace(/\/$/, "");
const firebaseApiKey = process.env.FIREBASE_WEB_API_KEY?.trim();
const outputDir = path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR ?? "output/playwright/auth-email-clarity");
if (!firebaseApiKey) throw new Error("FIREBASE_WEB_API_KEY is required");

await fs.mkdir(outputDir, { recursive: true });
const results = [];
function check(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}: ${detail}`);
}

function safeRequestUrl(value) {
  const parsed = new URL(value);
  return `${parsed.origin}${parsed.pathname}`;
}

async function firebase(method, payload) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${method}?key=${encodeURIComponent(firebaseApiKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20_000)
      });
      const body = await response.json();
      return { response, body };
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
    }
  }
  throw lastError;
}

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const email = `n50-auth-browser-smoke-${suffix}@example.com`;
const password = `N50-Smoke-${suffix}-A9!`;
let idToken = "";
const browser = await chromium.launch({ headless: true });

try {
  const signup = await firebase("signUp", { email, password, returnSecureToken: true });
  idToken = typeof signup.body.idToken === "string" ? signup.body.idToken : "";
  check("Firebase test account created", signup.response.ok && Boolean(idToken), signup.body?.error?.message ?? `HTTP ${signup.response.status}`);

  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();
  const clarityResponses = [];
  const clarityFailures = [];
  const verificationResponses = [];
  const consoleErrors = [];

  page.on("response", (response) => {
    if (/clarity\.ms/i.test(response.url())) clarityResponses.push({ status: response.status(), url: safeRequestUrl(response.url()) });
    if (/identitytoolkit\.googleapis\.com\/v1\/accounts:sendOobCode/i.test(response.url())) {
      verificationResponses.push({ status: response.status(), url: safeRequestUrl(response.url()) });
    }
  });
  page.on("requestfailed", (request) => {
    if (/clarity\.ms/i.test(request.url())) clarityFailures.push({ error: request.failure()?.errorText ?? "unknown", url: safeRequestUrl(request.url()) });
  });
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  const route = await page.goto(`${origin}/n50/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  check("Application route loads", Boolean(route?.ok()), `HTTP ${route?.status()}`);
  await page.getByRole("dialog").waitFor({ timeout: 20_000 });
  await page.getByRole("button", { name: "Log In", exact: true }).first().click();
  await page.getByLabel("Email or admin username").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.locator("form").getByRole("button", { name: "Log In", exact: true }).click();
  await page.getByRole("heading", { name: "Verify Your Email", exact: true }).waitFor({ timeout: 20_000 });
  check("Unverified email gets explicit gate", true);

  await page.getByRole("button", { name: "Resend Email", exact: true }).click();
  await page.getByText(/Verification email resent to/i).waitFor({ timeout: 20_000 });
  check(
    "Verification request accepted",
    verificationResponses.some((item) => item.status >= 200 && item.status < 300),
    JSON.stringify(verificationResponses)
  );

  await page.waitForTimeout(4_000);
  const clarityState = await page.evaluate(() => ({
    available: typeof window.clarity === "function",
    projectId: [...document.scripts].find((script) => /clarity\.ms\/tag\//i.test(script.src))?.getAttribute("data-clarity-id") ?? null
  }));
  check("Clarity client initialized", clarityState.available && Boolean(clarityState.projectId), JSON.stringify(clarityState));
  check(
    "Clarity collector delivered",
    clarityResponses.some((item) => /https:\/\/t\.clarity\.ms\/collect/i.test(item.url) && item.status >= 200 && item.status < 400),
    JSON.stringify(clarityResponses)
  );
  check("Clarity has no blocked requests", clarityFailures.length === 0, JSON.stringify(clarityFailures));
  check(
    "No auth or Clarity CSP console errors",
    consoleErrors.filter((message) => /identitytoolkit|firebase|clarity|content security policy/i.test(message)).length === 0,
    consoleErrors.join(" | ")
  );

  await page.screenshot({ path: path.join(outputDir, "email-verification-and-clarity-1366x768.png") });
  await fs.writeFile(
    path.join(outputDir, "results.json"),
    `${JSON.stringify({ checks: results.length, passed: results.filter((item) => item.passed).length, results, clarityResponses, verificationResponses }, null, 2)}\n`
  );
  console.log(JSON.stringify({ checks: results.length, passed: results.filter((item) => item.passed).length, outputDir }, null, 2));
} finally {
  if (idToken) await firebase("delete", { idToken }).catch(() => null);
  await browser.close();
}
