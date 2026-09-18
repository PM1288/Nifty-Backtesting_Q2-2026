import fs from "node:fs/promises";
import assert from "node:assert/strict";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const origin = process.env.REVIEW_ORIGIN ?? "http://127.0.0.1:15218";
const output = process.env.REVIEW_OUTPUT ?? "output/playwright/data-health";
const env = await fs.readFile(".env", "utf8");
const password = env.split(/\r?\n/).find(line => line.startsWith("DEV_LOCAL_AUTH_PASSWORD="))?.split("=").slice(1).join("=").trim();
assert.ok(password, "Protected credentials required");
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH });
const evidence = { origin, errors: [], screenshots: [], status: "NOT_RUN", source: process.env.REVIEW_FIXTURE ? "Live database snapshot through candidate API model" : "Deployed authenticated API" };
try {
  const context = await browser.newContext({ viewport: { width:1920, height:1080 } });
  const login = await context.request.post("http://127.0.0.1:19090/n50/auth/session/dev-login", { data:{identifier:"admin",password} });
  assert.ok(login.ok());
  const cookie = (await context.storageState()).cookies.find(c => c.name.includes("session"));
  if (cookie) await context.addCookies([{...cookie,domain:"127.0.0.1",path:"/",secure:false,sameSite:"Lax"}]);
  const page = await context.newPage();
  page.on("pageerror", e => evidence.errors.push(String(e)));
  if (process.env.REVIEW_FIXTURE) {
    const body = await fs.readFile(process.env.REVIEW_FIXTURE,"utf8");
    await page.route("**/v1/data-health", route => route.fulfill({contentType:"application/json",body}));
  }
  let calls=0; page.on("response", response => {if(response.url().endsWith("/v1/data-health")){calls++;assert.equal(response.status(),200);}});
  await page.goto(`${origin}/n50/analytics/system/data-health`);
  const root = page.getByTestId("data-health-dashboard");
  await root.getByRole("heading",{name:"Symbol data",exact:true}).waitFor({timeout:90000});
  assert.ok(await root.locator("tbody tr").count()>0);
  const firstResponse = await page.request.get(`${origin}/n50/v1/data-health`);
  if(!process.env.REVIEW_FIXTURE) { assert.ok(firstResponse.ok());const data=await firstResponse.json();evidence.instruments=data.instruments.length;evidence.days=data.days.length; }
  for (const viewport of [{width:1920,height:1080},{width:390,height:844}]) {
    await page.setViewportSize(viewport); await page.waitForTimeout(500);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),"No page overflow");
    const filename=`${output}/dashboard-${viewport.width}.png`;await page.screenshot({path:filename,fullPage:true});evidence.screenshots.push(filename);
  }
  await root.getByLabel("Search symbol").fill("NIFTY");
  assert.ok(await root.locator("tbody").first().locator("tr").count()>0);
  await root.getByLabel("Search symbol").fill("NO_SUCH_SYMBOL_123");
  await root.getByText("No matching instruments.").waitFor();
  await root.getByLabel("Search symbol").fill("");
  await root.getByLabel("Instrument type").selectOption("FUT");
  assert.ok(await root.locator("tbody").first().locator("tr").count()>0);
  await root.getByLabel("Issues only").check();
  await root.getByLabel("Issues only").uncheck();
  await root.getByLabel("Instrument type").selectOption("ALL");
  const before=calls;await root.getByRole("button",{name:"Refresh",exact:true}).click();
  await page.waitForTimeout(1500);assert.ok(calls>before,"Manual refresh requests evidence");
  const downloadPromise=page.waitForEvent("download");await root.getByRole("button",{name:"Export evidence"}).click();
  const download=await downloadPromise;assert.ok(download.suggestedFilename().endsWith(".json"));
  assert.equal(evidence.errors.length,0);evidence.status="PASS";
} catch(error){evidence.status="FAIL";evidence.failure=String(error);process.exitCode=1;}
finally{await browser.close();await fs.writeFile(`${output}/results.json`,JSON.stringify(evidence,null,2));}
console.log(JSON.stringify(evidence));
