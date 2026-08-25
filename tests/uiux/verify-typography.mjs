#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const requireFromTools = createRequire(
  path.join(root, "tools/playwright/package.json"),
);
const { chromium } = requireFromTools("playwright");
const origin = (
  process.env.PLAYWRIGHT_ORIGIN ?? "http://127.0.0.1:19100"
).replace(/\/$/, "");
const route = process.env.TYPOGRAPHY_ROUTE ?? "/";
const envFile = process.env.PLAYWRIGHT_ADMIN_PASSWORD_FILE;
if (!envFile) throw new Error("PLAYWRIGHT_ADMIN_PASSWORD_FILE is required");
const raw = await fs.readFile(envFile, "utf8");
const entry = raw
  .split(/\r?\n/)
  .find((line) => line.startsWith("DEV_LOCAL_AUTH_PASSWORD="));
if (!entry)
  throw new Error(
    "DEV_LOCAL_AUTH_PASSWORD is absent from the provided environment file",
  );
const password = entry
  .slice(entry.indexOf("=") + 1)
  .trim()
  .replace(/^(["'])(.*)\1$/, "$2");
const outputDir = path.join(root, "docs/uiux/typography");
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  colorScheme: "light",
});
const login = await context.request.post(`${origin}/auth/session/dev-login`, {
  data: { identifier: "admin", password },
});
if (!login.ok())
  throw new Error(`Authorised login failed with HTTP ${login.status()}`);
const page = await context.newPage();

try {
  await page.goto(`${origin}/n50${route}`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await page.waitForTimeout(2_000);
  await page.evaluate(() =>
    localStorage.removeItem("n50:accessibility:font-mode"),
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2_000);
  const standard = await page.evaluate(() => ({
    mode: document.documentElement.dataset.fontMode,
    bodyFont: getComputedStyle(document.body).fontFamily,
    numericFont: getComputedStyle(document.documentElement)
      .getPropertyValue("--font-numeric")
      .trim(),
    uiFont: getComputedStyle(document.documentElement)
      .getPropertyValue("--font-ui")
      .trim(),
    externalFontRequests: performance
      .getEntriesByType("resource")
      .map((item) => item.name)
      .filter(
        (name) => /font|woff/i.test(name) && !name.startsWith(location.origin),
      ),
    undersizedVisibleText: [...document.querySelectorAll("main *")]
      .filter((node) => {
        const element = node;
        const ownText = [...element.childNodes].some(
          (child) =>
            child.nodeType === Node.TEXT_NODE && child.textContent?.trim(),
        );
        if (!ownText || !element.getClientRects().length) return false;
        const style = getComputedStyle(element);
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number.parseFloat(style.fontSize) < 11.5
        );
      })
      .slice(0, 30)
      .map((element) => ({
        tag: element.tagName,
        className: element.className,
        text: element.textContent?.trim().slice(0, 80),
        fontSize: getComputedStyle(element).fontSize,
      })),
  }));
  if (
    standard.mode !== "standard" ||
    !standard.bodyFont.includes("Inter Variable")
  )
    throw new Error(
      `Unexpected standard font state: ${JSON.stringify(standard)}`,
    );
  if (
    !standard.numericFont.includes("Inter Variable") ||
    standard.numericFont.includes("IBM Plex Mono")
  ) {
    throw new Error(
      `Numeric token does not resolve through the Inter UI family: ${standard.numericFont}`,
    );
  }
  if (standard.externalFontRequests.length)
    throw new Error(
      `External font requests detected: ${standard.externalFontRequests.join(", ")}`,
    );

  await page
    .locator('button[aria-haspopup="menu"]')
    .filter({ hasText: /Connected/ })
    .click();
  const fontToggle = page.getByRole("menuitemcheckbox", {
    name: "High-legibility font",
  });
  await fontToggle.click();
  const accessible = await page.evaluate(() => ({
    mode: document.documentElement.dataset.fontMode,
    bodyFont: getComputedStyle(document.body).fontFamily,
    stored: localStorage.getItem("n50:accessibility:font-mode"),
  }));
  if (
    accessible.mode !== "high-legibility" ||
    accessible.stored !== "high-legibility" ||
    !accessible.bodyFont.includes("Atkinson Hyperlegible Next Variable")
  ) {
    throw new Error(
      `Unexpected high-legibility state: ${JSON.stringify(accessible)}`,
    );
  }
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2_000);
  const persisted = await page.evaluate(() => ({
    mode: document.documentElement.dataset.fontMode,
    bodyFont: getComputedStyle(document.body).fontFamily,
  }));
  if (
    persisted.mode !== "high-legibility" ||
    !persisted.bodyFont.includes("Atkinson Hyperlegible Next Variable")
  )
    throw new Error(
      `Font preference did not persist: ${JSON.stringify(persisted)}`,
    );
  const slug = route === "/" ? "home" : route.slice(1).replaceAll("/", "-");
  await page.screenshot({
    path: path.join(outputDir, `${slug}-high-legibility-1440x900.png`),
    fullPage: true,
    animations: "disabled",
  });
  await fs.writeFile(
    path.join(outputDir, `${slug}-verification.json`),
    `${JSON.stringify({ origin, route, standard, accessible, persisted }, null, 2)}\n`,
  );
  console.log(
    JSON.stringify(
      {
        ok: true,
        standard,
        accessible,
        persisted,
        evidence: `docs/uiux/typography/${slug}-verification.json`,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
