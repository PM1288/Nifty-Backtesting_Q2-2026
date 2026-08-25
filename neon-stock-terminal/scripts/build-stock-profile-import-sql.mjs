import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const masterPath = resolve(process.argv[2]);
const logosDir = resolve(process.argv[3]);
const output = resolve(process.argv[4] ?? "/tmp/n50-stock-profiles.sql");
const master = JSON.parse(await readFile(masterPath, "utf8"));
const q = (value) => `'${String(value ?? "").replaceAll("'", "''")}'`;
const statements = ["begin;"];
for (const row of master.records) {
  const symbol = row["NSE Symbol"];
  const svg = await readFile(resolve(logosDir, `${symbol}.svg`), "utf8");
  const memberships = JSON.stringify(String(row["All Memberships"] ?? "").split(";").map((item) => item.trim()).filter(Boolean));
  const asOf = master.metadata.as_of_date ?? row["Official Index Data As Of"];
  statements.push(`insert into public.instrument_profiles(symbol,company_name,isin,sector,market_cap_bucket,is_nifty_50,is_nifty_100,is_nifty_200,is_nifty_largemidcap_250,is_nifty_500,is_nse_fno,memberships,logo_svg,logo_sha256,source_as_of,source_name) values (${q(symbol)},${q(row["Company Name"])},${q(row.ISIN)},${q(row.Sector)},${q(row["Market Cap Bucket"])},${row["NIFTY 50"] === "Yes"},${row["NIFTY 100"] === "Yes"},${row["NIFTY 200"] === "Yes"},${row["NIFTY LargeMidcap 250"] === "Yes"},${row["NIFTY 500"] === "Yes"},${row["NSE F&O Eligible"] === "Yes"},${q(memberships)}::jsonb,${q(svg)},${q(createHash("sha256").update(svg).digest("hex"))},${q(asOf)}::date,${q("NIFTY_250_FO_Structured_Stock_Master_2026-08-23")}) on conflict(symbol) do update set company_name=excluded.company_name,isin=excluded.isin,sector=excluded.sector,market_cap_bucket=excluded.market_cap_bucket,is_nifty_50=excluded.is_nifty_50,is_nifty_100=excluded.is_nifty_100,is_nifty_200=excluded.is_nifty_200,is_nifty_largemidcap_250=excluded.is_nifty_largemidcap_250,is_nifty_500=excluded.is_nifty_500,is_nse_fno=excluded.is_nse_fno,memberships=excluded.memberships,logo_svg=excluded.logo_svg,logo_sha256=excluded.logo_sha256,source_as_of=excluded.source_as_of,source_name=excluded.source_name,updated_at=now();`);
}
statements.push("commit;");
await writeFile(output, statements.join("\n"));
console.log(`Wrote ${master.records.length} idempotent profile upserts to ${output}`);
