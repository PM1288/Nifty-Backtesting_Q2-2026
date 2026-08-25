import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const source = resolve(process.argv[2] ?? "../Stock-details-and-logos/NIFTY_250_FO_Structured_Stock_Master_2026-08-23.json");
const target = resolve(process.argv[3] ?? "apps/web/public/stock-profiles.json");
const logosDir = resolve(process.argv[4] ?? "apps/web/public/stock-logos");
const payload = JSON.parse(await readFile(source, "utf8"));
const records = await Promise.all(payload.records.map(async (row) => ({
  symbol: row["NSE Symbol"],
  name: row["Company Name"],
  isin: row.ISIN,
  sector: row.Sector,
  capBucket: row["Market Cap Bucket"],
  nifty50: row["NIFTY 50"] === "Yes",
  nifty100: row["NIFTY 100"] === "Yes",
  nifty200: row["NIFTY 200"] === "Yes",
  largeMidcap250: row["NIFTY LargeMidcap 250"] === "Yes",
  nifty500: row["NIFTY 500"] === "Yes",
  fno: row["NSE F&O Eligible"] === "Yes",
  memberships: String(row["All Memberships"] ?? "").split(";").map((item) => item.trim()).filter(Boolean),
  logoUrl: `data:image/svg+xml;base64,${(await readFile(resolve(logosDir, `${row["NSE Symbol"]}.svg`))).toString("base64")}`,
})));
await writeFile(target, `${JSON.stringify({ asOf: payload.metadata.as_of_date ?? payload.records[0]?.["Official Index Data As Of"], source: "NIFTY 250 and NSE F&O structured stock master", records })}\n`);
console.log(`Wrote ${records.length} stock profiles to ${target}`);
