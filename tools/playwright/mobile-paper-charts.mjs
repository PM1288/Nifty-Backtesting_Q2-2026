import assert from "node:assert/strict";
import { devices, webkit } from "playwright";

const base = process.env.PLAYWRIGHT_BASE_URL;
const browser = await webkit.launch();
try {
  const ctx = await browser.newContext(devices["iPhone 13"]);
  const login = await ctx.request.post(base + "/auth/session/dev-login", {
    data: {identifier: "admin", password: process.env.PLAYWRIGHT_ADMIN_PASSWORD}
  });
  assert.equal(login.status(), 200);
  const page = await ctx.newPage();
  for (const view of ["crypto", "scalper_v2"]) {
    await page.goto(base + "/strategy/trading-analytics?view=" + view, {waitUntil:"domcontentloaded"});
    const charts = view === "crypto" ? page.locator('[aria-label$="and actual volume"]') :
      page.locator('[data-testid="v2-side-oi-chart"] [role="img"]');
    await charts.first().locator("canvas").first().waitFor({timeout:90000});
    if (view === "crypto") {
      assert.equal(await charts.count(),6);
      await page.getByLabel("Volume",{exact:true}).selectOption("usdt");
      await page.getByLabel("Chart range").selectOption("4");
    }
    for (const width of [320,390,844]) {
      await page.setViewportSize({width,height:width===844 ? 390 : 844});
      await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth+1);
      for (const plot of await charts.all()) {
        const box = await plot.boundingBox();
        assert.ok(box && box.x >= 0 && box.x+box.width <= width+1 && box.width >= 200 && box.height >= 100);
      }
      if (view === "scalper_v2") {
        const expand = page.getByTestId("v2-side-oi-chart").getByRole("button",{name:/expand/i});
        assert.ok((await expand.boundingBox()).height >= 44);
        await expand.tap();
        const modal = page.getByTestId("v2-expanded-chart");
        await modal.locator("canvas").first().waitFor();
        const bounds = await modal.boundingBox();
        assert.ok(bounds && bounds.width <= width + 1);
        await modal.getByRole("button",{name:/close/i}).tap();
        await modal.waitFor({state:"hidden"});
      }
    }
    console.log("Passed charts, rotation and controls",view);
  }
} finally { await browser.close(); }
