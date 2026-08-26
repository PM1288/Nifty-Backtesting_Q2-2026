import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const appBase = (process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:19090/n50").replace(/\/$/, "");
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
const outputDir = path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR ?? "output/playwright/header-speech");
if (!password) throw new Error("PLAYWRIGHT_ADMIN_PASSWORD is required.");

const viewports = [
  { name: "desktop-1920", width: 1920, height: 1080 },
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "tablet-1024", width: 1024, height: 768 },
  { name: "mobile-390", width: 390, height: 844 },
];
const results = [];
function check(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}: ${detail}`);
}

const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport });
    const login = await context.request.post(`${appBase}/auth/session/dev-login`, {
      data: { identifier: "admin", password },
      headers: { Origin: new URL(appBase).origin },
    });
    check(`${viewport.name} login`, login.ok(), `status=${login.status()}`);
    await context.addInitScript(() => localStorage.removeItem("n50.paper-alert-voice"));
    const page = await context.newPage();
    const response = await page.goto(`${appBase}/`, { waitUntil: "networkidle", timeout: 90_000 });
    check(`${viewport.name} route`, Boolean(response?.ok()), `status=${response?.status()}`);
    const geometry = await page.evaluate(() => {
      const header = document.querySelector("header");
      const search = document.querySelector('button[aria-label="Search stocks, dashboards and actions"]');
      const voice = document.querySelector('button[aria-label="Mute paper trade voice alerts"]');
      const user = document.querySelector('button[aria-haspopup="menu"]');
      const nifty = document.querySelector('[data-testid="nifty-header-quote"]');
      const rect = (element) => element?.getBoundingClientRect() ?? null;
      return {
        header: rect(header), search: rect(search), voice: rect(voice), user: rect(user), nifty: rect(nifty),
        tickerCount: document.querySelectorAll('[aria-label="Market ticker tape"], [data-clarity-region="top_ticker"]').length,
        overflow: document.documentElement.scrollWidth > window.innerWidth + 2,
      };
    });
    check(`${viewport.name} ticker removed`, geometry.tickerCount === 0, `count=${geometry.tickerCount}`);
    check(`${viewport.name} no page overflow`, !geometry.overflow);
    check(`${viewport.name} concise voice defaults on`, await page.getByRole("button", { name: "Mute paper trade voice alerts" }).getAttribute("aria-pressed") === "true");
    check(`${viewport.name} NIFTY retained`, Boolean(geometry.nifty));
    const header = geometry.header;
    check(`${viewport.name} header height`, Boolean(header) && header.height <= (viewport.width <= 720 ? 45 : 35), JSON.stringify(header));
    for (const [name, box] of [["search", geometry.search], ["voice", geometry.voice], ["user", geometry.user]]) {
      check(`${viewport.name} ${name} exists`, Boolean(box));
      check(`${viewport.name} ${name} contained`, Boolean(header && box && box.top >= header.top - 0.5 && box.bottom <= header.bottom + 0.5), JSON.stringify({ header, box }));
    }

    if (viewport.width > 720) {
      await page.goto(`${appBase}/strategy/monthly`, { waitUntil: "domcontentloaded", timeout: 90_000 });
      const strategyLink = page
        .getByRole("navigation", { name: "Workspace navigation" })
        .getByRole("link", { name: /Strategy/ })
        .first();
      await strategyLink.hover();
      const strategyMenu = page.getByRole("menu", { name: "Strategy dashboards" });
      await strategyMenu.waitFor({ state: "visible" });
      const strategyStack = await strategyMenu.evaluate((menu) => {
        const rect = menu.getBoundingClientRect();
        const points = [
          [rect.left + 12, rect.top + 12],
          [rect.left + rect.width / 2, rect.top + rect.height / 2],
          [rect.right - 12, rect.bottom - 12],
        ];
        return {
          zIndex: getComputedStyle(menu).zIndex,
          points: points.map(([x, y]) => {
            const top = document.elementFromPoint(x, y);
            return Boolean(top && (top === menu || menu.contains(top)));
          }),
        };
      });
      check(
        `${viewport.name} Strategy menu above frozen filters`,
        strategyStack.points.every(Boolean),
        JSON.stringify(strategyStack),
      );

      const userButton = page.locator('header button[aria-haspopup="menu"]');
      await userButton.click();
      const userMenuItem = page.getByRole("menuitemcheckbox", { name: /High-legibility font/ });
      await userMenuItem.waitFor({ state: "visible" });
      const userMenu = userMenuItem.locator("xpath=ancestor::*[@role='menu'][1]");
      const userStack = await userMenu.evaluate((menu) => {
        const rect = menu.getBoundingClientRect();
        const points = [
          [rect.left + 12, rect.top + 12],
          [rect.left + rect.width / 2, rect.top + rect.height / 2],
          [rect.right - 12, rect.bottom - 12],
        ];
        return {
          zIndex: getComputedStyle(menu).zIndex,
          points: points.map(([x, y]) => {
            const top = document.elementFromPoint(x, y);
            return Boolean(top && (top === menu || menu.contains(top)));
          }),
        };
      });
      check(
        `${viewport.name} user menu above frozen filters`,
        userStack.points.every(Boolean),
        JSON.stringify(userStack),
      );
      await page.screenshot({ path: path.join(outputDir, `${viewport.name}-dropdown-stacking.png`), fullPage: false });
    }
    await page.screenshot({ path: path.join(outputDir, `${viewport.name}.png`), fullPage: false });
    await context.close();
  }

  const context = await browser.newContext();
  const login = await context.request.post(`${appBase}/auth/session/dev-login`, {
    data: { identifier: "admin", password }, headers: { Origin: new URL(appBase).origin },
  });
  check("notification API login", login.ok(), `status=${login.status()}`);
  const notificationResponse = await context.request.get(`${appBase}/v1/paper/notifications?limit=5`);
  check("notification API", notificationResponse.ok(), `status=${notificationResponse.status()}`);
  const payload = await notificationResponse.json();
  check("notification API returned durable events", Array.isArray(payload.items) && payload.items.length > 0, `items=${payload.items?.length ?? 0}`);
  for (const item of payload.items ?? []) {
    const expected = item.kind === "TARGET_HIT"
      ? /^Target hit\. .+\.$/
      : /^.+\. Entry price [\d,]+\.\d{2} rupees\.( Target price [\d,]+\.\d{2} rupees\.)?$/;
    check(`concise API speech ${item.id}`, expected.test(item.speechText), item.speechText);
  }
  await context.close();
} finally {
  await browser.close();
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
}

console.log(JSON.stringify({ checks: results.length, passed: results.filter((item) => item.passed).length, outputDir }, null, 2));
