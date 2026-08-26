import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const origin = (process.env.PLAYWRIGHT_ORIGIN ?? "http://127.0.0.1:19090").replace(/\/$/, "");
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
const outputDir = path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR ?? "output/playwright/paper-evidence-geometry");
if (!password) throw new Error("PLAYWRIGHT_ADMIN_PASSWORD is required.");

await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
function check(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}: ${detail}`);
}

async function assertGeometry(page, density, expectedHeight) {
  const table = page.locator(`[data-density="${density}"] table`).first();
  await table.waitFor();
  const rows = table.locator("tbody tr");
  check(`${density} has rows`, await rows.count() > 0, "evidence table is empty");
  const geometry = await rows.evaluateAll((nodes) => nodes.slice(0, 12).map((row) => ({
    row: row.getBoundingClientRect().height,
    cells: [...row.querySelectorAll("td")].map((cell) => cell.getBoundingClientRect().height),
  })));
  check(`${density} fixed row height`, geometry.every((item) => Math.abs(item.row - expectedHeight) <= 1), JSON.stringify(geometry));
  check(`${density} fixed cell height`, geometry.every((item) => item.cells.every((height) => Math.abs(height - expectedHeight) <= 1)), JSON.stringify(geometry));
}

try {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const login = await context.request.post(`${origin}/auth/session/dev-login`, { data: { identifier: "admin", password } });
  check("admin login", login.ok(), `status=${login.status()}`);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  const response = await page.goto(`${origin}/n50/paper-trading?prefetch=off`, { waitUntil: "networkidle", timeout: 60_000 });
  check("route response", Boolean(response?.ok()), `status=${response?.status()}`);
  await page.getByRole("heading", { name: "Complete trade evidence", exact: true }).waitFor();
  await page.getByRole("button", { name: "Dense", exact: true }).click();
  await assertGeometry(page, "dense", 82);

  const firstRow = page.locator('[data-density="dense"] tbody tr').first();
  const cellKinds = await firstRow.locator("td[data-cell-kind]").evaluateAll((cells) => cells.map((cell) => cell.getAttribute("data-cell-kind")));
  for (const kind of ["trade", "direction", "strategy", "capital", "economics", "target", "horizon", "time", "rewardPain", "carry", "quality", "comments", "action"]) {
    check(`renderer ${kind}`, cellKinds.includes(kind), `${kind} missing from ${cellKinds.join(",")}`);
  }
  const slotCounts = await firstRow.locator("td[data-cell-kind]").evaluateAll((cells) => cells.map((cell) => cell.querySelectorAll("[data-slot]").length));
  check("five-slot anatomy", slotCounts.every((count) => count === 5), JSON.stringify(slotCounts));

  const alignment = await firstRow.evaluate((row) => Object.fromEntries([...row.querySelectorAll("td[data-cell-kind]")].map((cell) => {
    const kind = cell.getAttribute("data-cell-kind");
    const grid = cell.firstElementChild;
    return [kind, grid ? getComputedStyle(grid).textAlign : "missing"];
  })));
  for (const kind of ["capital", "economics", "rewardPain", "carry"]) check(`${kind} right aligned`, alignment[kind] === "right", JSON.stringify(alignment));

  const sticky = await firstRow.evaluate((row) => Object.fromEntries([...row.querySelectorAll("td[data-sticky]")].map((cell) => [cell.getAttribute("data-cell-kind"), { position:getComputedStyle(cell).position, left:getComputedStyle(cell).left, right:getComputedStyle(cell).right }])));
  check("trade sticky", sticky.trade?.position === "sticky" && sticky.trade.left === "0px", JSON.stringify(sticky));
  check("direction sticky", sticky.direction?.left === "220px", JSON.stringify(sticky));
  check("strategy sticky", sticky.strategy?.left === "320px", JSON.stringify(sticky));
  check("action sticky", sticky.action?.position === "sticky" && sticky.action.right === "0px", JSON.stringify(sticky));

  await page.getByRole("button", { name: "Comfortable", exact: true }).click();
  await assertGeometry(page, "comfortable", 98);
  await page.getByRole("button", { name: "Audit", exact: true }).click();
  await assertGeometry(page, "audit", 112);
  await page.getByRole("button", { name: "Dense", exact: true }).click();

  for (const preset of ["All fields", "Execution", "Targets", "Horizon", "Risk", "Quality"]) {
    await page.getByRole("button", { name: preset, exact: true }).click();
    await assertGeometry(page, "dense", 82);
  }
  await page.getByRole("button", { name: "All fields", exact: true }).click();
  const tableFrame = page.locator('[data-density="dense"]').first();
  await tableFrame.screenshot({ path:path.join(outputDir,"paper-evidence-table-1920x1080.png") });

  await page.setViewportSize({ width:1440, height:900 });
  await page.reload({ waitUntil:"networkidle" });
  await page.getByRole("heading", { name:"Complete trade evidence", exact:true }).waitFor();
  await page.getByRole("button", { name:"Dense", exact:true }).click();
  await assertGeometry(page,"dense",82);
  await page.locator('[data-density="dense"]').first().screenshot({ path:path.join(outputDir,"paper-evidence-table-1440x900.png") });
  check("page errors", errors.length === 0, errors.join(" | "));
  await context.close();
} finally {
  await browser.close();
  await fs.writeFile(path.join(outputDir,"results.json"), `${JSON.stringify(results,null,2)}\n`);
}

console.log(JSON.stringify({checks:results.length,passed:results.filter((item) => item.passed).length,outputDir},null,2));
