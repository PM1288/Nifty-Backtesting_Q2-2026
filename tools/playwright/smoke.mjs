import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium, devices } from "playwright";

const TASK_SLUG = process.env.PLAYWRIGHT_TASK_SLUG ?? "secret-hygiene-config-hardening";
const defaultBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:19090/n50";
const baseUrl = defaultBaseUrl.replace(/\/+$/, "");
const outputRoot = path.resolve(
  process.cwd(),
  process.env.PLAYWRIGHT_OUTPUT_DIR ?? `output/playwright/${TASK_SLUG}`
);

const defaultRoutes = [
  { slug: "landing", path: "/" },
  { slug: "feedback", path: "/feedback" },
  { slug: "analytics-stock-reliance", path: "/analytics/stock/RELIANCE" }
];

function loadRoutes() {
  const raw = process.env.PLAYWRIGHT_ROUTES_JSON;
  if (!raw) return defaultRoutes;

  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("PLAYWRIGHT_ROUTES_JSON must be a non-empty JSON array.");
  }

  return parsed.map((route, index) => {
    if (!route || typeof route !== "object") {
      throw new Error(`Route at index ${index} must be an object.`);
    }
    const slug = typeof route.slug === "string" ? route.slug.trim() : "";
    const routePath = typeof route.path === "string" ? route.path.trim() : "";
    if (!slug || !routePath) {
      throw new Error(`Route at index ${index} must include non-empty slug and path.`);
    }
    return { slug, path: routePath };
  });
}

const routes = loadRoutes();

const viewports = [
  { slug: "desktop", contextOptions: { viewport: { width: 1440, height: 900 } } },
  { slug: "laptop", contextOptions: { viewport: { width: 1366, height: 900 } } },
  { slug: "tablet", contextOptions: { viewport: { width: 768, height: 1024 } } },
  { slug: "mobile", contextOptions: { ...devices["iPhone 12"] } }
];

function joinUrl(pathname) {
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${baseUrl}${normalizedPath}`;
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function captureRoute(browser, route, viewportConfig) {
  const routeDir = path.join(outputRoot, viewportConfig.slug);
  await ensureDir(routeDir);

  const context = await browser.newContext(viewportConfig.contextOptions);
  const page = await context.newPage();

  const consoleMessages = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      consoleMessages.push(`[${message.type()}] ${message.text()}`);
    }
  });

  const url = joinUrl(route.path);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(2_500);
  await page.screenshot({
    path: path.join(routeDir, `${route.slug}.png`),
    fullPage: true
  });

  const metadata = {
    viewport: viewportConfig.slug,
    route: route.path,
    url,
    title: await page.title(),
    consoleMessages
  };

  await fs.writeFile(
    path.join(routeDir, `${route.slug}.json`),
    JSON.stringify(metadata, null, 2),
    "utf8"
  );

  await context.close();
}

async function main() {
  await ensureDir(outputRoot);
  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of viewports) {
      for (const route of routes) {
        await captureRoute(browser, route, viewport);
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
