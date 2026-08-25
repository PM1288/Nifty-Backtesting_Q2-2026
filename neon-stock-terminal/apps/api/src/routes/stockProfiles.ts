import type { Express } from "express";
import type { PrismaClient } from "@prisma/client";

type Row = Record<string, unknown>;
export function registerStockProfiles(app: Express, prisma: PrismaClient) {
  app.get("/v1/instrument-profiles", async (_req, res, next) => {
    try {
      const rows = await prisma.$queryRawUnsafe<Row[]>(`select symbol,company_name as name,isin,sector,market_cap_bucket as "capBucket",is_nifty_50 as "nifty50",is_nifty_100 as "nifty100",is_nifty_200 as "nifty200",is_nifty_largemidcap_250 as "largeMidcap250",is_nifty_500 as "nifty500",is_nse_fno as fno,memberships,source_as_of as "sourceAsOf",logo_sha256 as "logoSha256" from public.instrument_profiles order by symbol`);
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.json({ asOf: rows[0]?.sourceAsOf ?? null, records: rows.map((row) => ({ ...row, logoUrl: `/v1/instrument-profiles/${encodeURIComponent(String(row.symbol))}/logo.svg` })) });
    } catch (error) { next(error); }
  });
  app.get("/v1/instrument-profiles/:symbol/logo.svg", async (req, res, next) => {
    try {
      const rows = await prisma.$queryRawUnsafe<Row[]>(`select logo_svg,logo_sha256 from public.instrument_profiles where symbol=$1 limit 1`, String(req.params.symbol).toUpperCase());
      if (!rows[0]) return res.status(404).json({ error: { code: "PROFILE_NOT_FOUND", message: "Stock logo is not available." } });
      res.setHeader("Content-Type", "image/svg+xml; charset=utf-8"); res.setHeader("ETag", `\"${rows[0].logo_sha256}\"`); res.setHeader("Cache-Control", "private, max-age=86400"); res.send(rows[0].logo_svg);
    } catch (error) { next(error); }
  });
}
