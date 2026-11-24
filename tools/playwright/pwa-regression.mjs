import assert from "node:assert/strict";
import { chromium, webkit, devices } from "playwright";

const base = (process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:19090/n50").replace(/\/?$/, "/");
for (const [engine, device] of [[webkit, "iPhone 13"], [webkit, "iPad (gen 7) landscape"], [chromium, "Pixel 7"], [chromium, "Desktop Chrome"]]) {
  const browser = await engine.launch();
  try {
    const context = await browser.newContext(devices[device]);
    if (process.env.PLAYWRIGHT_ADMIN_PASSWORD) {
      const login = await context.request.post(base + "auth/session/dev-login", {
        data: { identifier: "admin", password: process.env.PLAYWRIGHT_ADMIN_PASSWORD }
      });
      assert.equal(login.status(), 200);
    }
    const page = await context.newPage();
    for (const route of ["", "strategy/oiis-live", "strategy/trading-analytics?view=trade-log", "paper-trading", "analytics/stock/RELIANCE"]) {
      await page.goto(base + route, {waitUntil: "domcontentloaded"});
      await page.locator("main:visible").first().waitFor();
      const fits = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
      assert.ok(fits, device + " document overflow on " + route);
    }
    await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller));
    const manifest = await (await context.request.get(base + "manifest.webmanifest")).json();
    assert.equal(manifest.display, "standalone");
    assert.equal(new URL(manifest.start_url, base).href, base);
    for (const icon of manifest.icons) assert.equal((await context.request.get(base + icon.src)).status(), 200);
    if (engine === chromium) {
      const cdp = await context.newCDPSession(page);
      const { installabilityErrors } = await cdp.send("Page.getInstallabilityErrors");
      assert.deepEqual(installabilityErrors, []);
      await context.setOffline(true);
      await page.getByRole("dialog", {name: "Connection unavailable"}).waitFor();
      await context.setOffline(false);
      await page.getByRole("button", {name: "Reload workspace"}).waitFor({timeout: 45000});
      await page.getByRole("button", {name: "Reload workspace"}).click();
      await page.locator("main:visible").first().waitFor();
      await context.setOffline(true);
      const response = await page.reload({waitUntil: "domcontentloaded"});
      assert.equal(response.status(), 503);
      await page.getByRole("heading", {name: "Connection unavailable"}).waitFor();
      assert.equal(await page.evaluate(() => caches.keys().then(keys => keys.length)), 0);
      assert.equal(await page.evaluate(async url => fetch(url, {cache:"no-store"}).then(() => false, () => true), base + "auth/session"), true);
      await context.setOffline(false);
      await page.getByRole("link", {name:"Try again"}).click();
      await page.locator("main:visible").first().waitFor();
    }
    console.log("Passed", device);
  } finally {
    await browser.close();
  }
}
