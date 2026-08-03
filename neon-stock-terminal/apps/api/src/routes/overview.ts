import type { Express } from "express";
import { Prisma, type PrismaClient } from "@prisma/client";
import { marketDayIso, marketDayKeyUtc, marketDayStartUtc } from "../lib/time";
import { getStoredSnapshot, materializeSnapshot, serveSnapshotRoute, type SnapshotDefinition } from "../lib/dashboardSnapshots";
import { toNumber, toSafeVolume } from "../lib/num";

export type Quote = {
  symbol: string;
  name: string;
  last: number;
  change: number;
  changePct: number;
  sector: string | null;
  volume: number | string | null;
  timestamp: string;
  rsi: number | null;
  willr: number | null;
};

type QuoteLite = {
  symbol: string;
  last: number;
  changePct: number;
};

type SectorGroup = { sector: string; stocks: Quote[] };

type OverviewPayload = {
  asOf: string;
  market: {
    isOpen: boolean;
    label: "OPEN" | "CLOSED";
  };
  indices: {
    nifty50: Quote;
    bankNifty: Quote;
    indiaVix: Quote;
  };
  nifty: Quote;
  sectors: SectorGroup[];
  leaderboards: {
    gainers: Quote[];
    losers: Quote[];
  };
  tickerTape: QuoteLite[];
};

type StackQuoteRow = {
  symbol: string;
  name: string;
  sector: string | null;
  last: number | null;
  change: number | null;
  change_pct: number | null;
  volume: number | string | null;
  timestamp: Date | string | null;
  rsi_14: number | null;
  willr_14: number | null;
};

type StackIndexRow = {
  symbol: string;
  name: string;
  last: number | null;
  change: number | null;
  change_pct: number | null;
  volume: number | string | null;
  timestamp: Date | string | null;
  rsi_14: number | null;
  willr_14: number | null;
};

function toIso(ts: Date | string | null | undefined): string {
  if (!ts) return new Date().toISOString();
  if (ts instanceof Date) return ts.toISOString();
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function asQuote(row: StackQuoteRow): Quote {
  return {
    symbol: row.symbol,
    name: row.name || row.symbol,
    sector: row.sector ?? null,
    last: toNumber(row.last),
    change: toNumber(row.change),
    changePct: toNumber(row.change_pct),
    volume: toSafeVolume(row.volume),
    timestamp: toIso(row.timestamp),
    rsi: row.rsi_14 == null ? null : toNumber(row.rsi_14),
    willr: row.willr_14 == null ? null : toNumber(row.willr_14)
  };
}

function makeIndexQuote(
  symbol: string,
  name: string,
  row: Pick<StackIndexRow, "last" | "change" | "change_pct" | "volume" | "timestamp" | "rsi_14" | "willr_14"> | null,
  asOf: string
): Quote {
  return {
    symbol,
    name,
    sector: "INDEX",
    last: toNumber(row?.last ?? 0),
    change: toNumber(row?.change ?? 0),
    changePct: toNumber(row?.change_pct ?? 0),
    volume: toSafeVolume(row?.volume ?? null),
    timestamp: toIso(row?.timestamp ?? asOf),
    rsi: row?.rsi_14 == null ? null : toNumber(row.rsi_14),
    willr: row?.willr_14 == null ? null : toNumber(row.willr_14)
  };
}

function isMissingRelationError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return msg.includes("does not exist") || msg.includes("relation") || msg.includes("p2021") || msg.includes("42p01");
}

function marketStatusIst(now = new Date()): { isOpen: boolean; label: "OPEN" | "CLOSED" } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(now);

  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Sat";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");

  const isWeekday = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(weekday);
  const mins = hour * 60 + minute;
  const openMins = 9 * 60 + 15;
  const closeMins = 15 * 60 + 30;
  const isOpen = isWeekday && mins >= openMins && mins < closeMins;

  return { isOpen, label: isOpen ? "OPEN" : "CLOSED" };
}

function buildOverviewFromQuotes(
  asOf: string,
  nifty: Quote,
  quotes: Quote[],
  indices: OverviewPayload["indices"]
): OverviewPayload {
  const sectorMap = new Map<string, Quote[]>();
  for (const quote of quotes) {
    const sector = quote.sector ?? "OTHER";
    if (!sectorMap.has(sector)) sectorMap.set(sector, []);
    sectorMap.get(sector)!.push(quote);
  }

  const sectors: SectorGroup[] = [...sectorMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([sector, list]) => ({
      sector,
      stocks: list.sort((a, b) => b.changePct - a.changePct)
    }));

  const sorted = [...quotes].sort((a, b) => b.changePct - a.changePct);
  const gainers = sorted.slice(0, 20);
  const losers = [...sorted].reverse().slice(0, 20);
  const moversByAbs = [...sorted].sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));

  const tickerTape: QuoteLite[] = [
    { symbol: indices.nifty50.symbol, last: indices.nifty50.last, changePct: indices.nifty50.changePct },
    { symbol: indices.bankNifty.symbol, last: indices.bankNifty.last, changePct: indices.bankNifty.changePct },
    { symbol: indices.indiaVix.symbol, last: indices.indiaVix.last, changePct: indices.indiaVix.changePct },
    ...moversByAbs
      .filter((q) => !["NIFTY50", "BANKNIFTY", "INDIAVIX"].includes(q.symbol))
      .slice(0, 30)
      .map((q) => ({ symbol: q.symbol, last: q.last, changePct: q.changePct }))
  ];

  return {
    asOf,
    market: marketStatusIst(new Date()),
    indices,
    nifty,
    sectors,
    leaderboards: { gainers, losers },
    tickerTape
  };
}

async function getTradingStackOverview(prisma: PrismaClient): Promise<OverviewPayload> {
  const [indexRows, stockRows] = await Promise.all([
    prisma.$queryRaw<StackIndexRow[]>(Prisma.sql`
      WITH index_targets(symbol_token, symbol, name) AS (
        VALUES
          ('99926000', 'NIFTY50', 'NIFTY 50'),
          ('99926009', 'BANKNIFTY', 'BANK NIFTY'),
          ('99926017', 'INDIAVIX', 'INDIA VIX')
      ),
      indicator_base AS (
        SELECT
          b.symbol_token,
          b.trade_date,
          b.high::double precision AS high,
          b.low::double precision AS low,
          b.close::double precision AS close,
          ROW_NUMBER() OVER (PARTITION BY b.symbol_token ORDER BY b.trade_date DESC) AS rn_desc,
          LAG(b.close::double precision) OVER (PARTITION BY b.symbol_token ORDER BY b.trade_date) AS prev_close
        FROM bars_1d b
        JOIN index_targets t ON t.symbol_token = b.symbol_token
        WHERE b.exchange = 'NSE'
      ),
      rsi_window AS (
        SELECT
          symbol_token,
          AVG(GREATEST(close - prev_close, 0)) AS avg_gain,
          AVG(GREATEST(prev_close - close, 0)) AS avg_loss
        FROM indicator_base
        WHERE rn_desc <= 15 AND prev_close IS NOT NULL
        GROUP BY symbol_token
      ),
      willr_window AS (
        SELECT
          symbol_token,
          MAX(high) AS high_max,
          MIN(low) AS low_min,
          (ARRAY_AGG(close ORDER BY trade_date DESC))[1] AS close_latest
        FROM indicator_base
        WHERE rn_desc <= 14
        GROUP BY symbol_token
      ),
      indicator_calc AS (
        SELECT
          t.symbol_token,
          CASE
            WHEN rw.avg_loss IS NULL THEN NULL
            WHEN rw.avg_loss = 0 THEN 100
            ELSE 100 - (100 / (1 + (rw.avg_gain / NULLIF(rw.avg_loss, 0))))
          END AS rsi_14,
          CASE
            WHEN ww.high_max IS NULL OR ww.low_min IS NULL OR ww.close_latest IS NULL THEN NULL
            WHEN ww.high_max = ww.low_min THEN NULL
            ELSE ((ww.high_max - ww.close_latest) / NULLIF(ww.high_max - ww.low_min, 0)) * -100
          END AS willr_14
        FROM index_targets t
        LEFT JOIN rsi_window rw ON rw.symbol_token = t.symbol_token
        LEFT JOIN willr_window ww ON ww.symbol_token = t.symbol_token
      )
      SELECT
        t.symbol,
        t.name,
        COALESCE(st.last_price, st.last_close, 0)::double precision AS last,
        COALESCE(st.net_change, 0)::double precision AS change,
        COALESCE(st.percent_change, 0)::double precision AS change_pct,
        COALESCE(st.last_volume, 0)::double precision AS volume,
        st.last_seen_ts AS timestamp,
        ic.rsi_14,
        ic.willr_14
      FROM index_targets t
      LEFT JOIN instrument_state st
        ON st.exchange = 'NSE' AND st.symbol_token = t.symbol_token
      LEFT JOIN indicator_calc ic
        ON ic.symbol_token = t.symbol_token
    `),
    prisma.$queryRaw<StackQuoteRow[]>(Prisma.sql`
      WITH universe AS (
        SELECT DISTINCT ON (iu.symbol_token)
          iu.symbol_token,
          UPPER(REGEXP_REPLACE(TRIM(iu.tradingsymbol), '-EQ$', '')) AS symbol,
          iu.tradingsymbol
        FROM instrument_universe iu
        WHERE iu.exchange = 'NSE'
          AND iu.universe_name = 'nifty100_equity'
          AND iu.active_to IS NULL
          AND COALESCE(TRIM(iu.tradingsymbol), '') <> ''
        ORDER BY iu.symbol_token, iu.active_from DESC NULLS LAST
      ),
      classified AS (
        SELECT
          u.symbol_token,
          u.symbol,
          u.tradingsymbol,
          CASE
            WHEN u.symbol IN ('TMCV', 'TMPV') THEN 'Automobile and Auto Components'
            ELSE COALESCE(
              NULLIF(TRIM(ic.sector), ''),
              NULLIF(TRIM(ic.industry), ''),
              NULLIF(TRIM(ic.basic_industry), ''),
              'OTHER'
            )
          END AS sector
        FROM universe u
        LEFT JOIN LATERAL (
          SELECT c.sector, c.industry, c.basic_industry
          FROM index_constituents c
          WHERE UPPER(TRIM(c.symbol)) = u.symbol
          ORDER BY
            CASE WHEN UPPER(TRIM(c.index_name)) IN ('NIFTY100', 'NIFTY 100') THEN 0 ELSE 1 END,
            c.updated_at DESC
          LIMIT 1
        ) ic ON TRUE
      ),
      rsi_window AS (
        SELECT
          d.symbol_token,
          AVG(d.gain) AS avg_gain,
          AVG(d.loss) AS avg_loss
        FROM (
          SELECT
            b.symbol_token,
            ROW_NUMBER() OVER (PARTITION BY b.symbol_token ORDER BY b.trade_date DESC) AS rn_desc,
            GREATEST(
              b.close::double precision
              - LAG(b.close::double precision) OVER (PARTITION BY b.symbol_token ORDER BY b.trade_date),
              0
            ) AS gain,
            GREATEST(
              LAG(b.close::double precision) OVER (PARTITION BY b.symbol_token ORDER BY b.trade_date)
              - b.close::double precision,
              0
            ) AS loss
          FROM bars_1d b
          JOIN universe u ON u.symbol_token = b.symbol_token
          WHERE b.exchange = 'NSE'
        ) d
        WHERE d.rn_desc <= 15 AND (d.gain IS NOT NULL OR d.loss IS NOT NULL)
        GROUP BY d.symbol_token
      ),
      willr_window AS (
        SELECT
          d.symbol_token,
          MAX(d.high) AS high_max,
          MIN(d.low) AS low_min,
          (ARRAY_AGG(d.close ORDER BY d.trade_date DESC))[1] AS close_latest
        FROM (
          SELECT
            b.symbol_token,
            b.trade_date,
            b.high::double precision AS high,
            b.low::double precision AS low,
            b.close::double precision AS close,
            ROW_NUMBER() OVER (PARTITION BY b.symbol_token ORDER BY b.trade_date DESC) AS rn_desc
          FROM bars_1d b
          JOIN universe u ON u.symbol_token = b.symbol_token
          WHERE b.exchange = 'NSE'
        ) d
        WHERE d.rn_desc <= 14
        GROUP BY d.symbol_token
      ),
      rsi_calc AS (
        SELECT
          symbol_token,
          CASE
            WHEN avg_loss IS NULL THEN NULL
            WHEN avg_loss = 0 THEN 100
            ELSE 100 - (100 / (1 + (avg_gain / NULLIF(avg_loss, 0))))
          END AS rsi_14
        FROM rsi_window
      ),
      willr_calc AS (
        SELECT
          symbol_token,
          CASE
            WHEN high_max IS NULL OR low_min IS NULL OR close_latest IS NULL THEN NULL
            WHEN high_max = low_min THEN NULL
            ELSE ((high_max - close_latest) / NULLIF(high_max - low_min, 0)) * -100
          END AS willr_14
        FROM willr_window
      )
      SELECT
        c.symbol,
        c.tradingsymbol AS name,
        c.sector,
        COALESCE(st.last_price, st.last_close, 0)::double precision AS last,
        COALESCE(st.net_change, 0)::double precision AS change,
        COALESCE(st.percent_change, 0)::double precision AS change_pct,
        COALESCE(st.last_volume, 0)::double precision AS volume,
        st.last_seen_ts AS timestamp,
        rc.rsi_14,
        wc.willr_14
      FROM classified c
      LEFT JOIN instrument_state st
        ON st.exchange = 'NSE' AND st.symbol_token = c.symbol_token
      LEFT JOIN rsi_calc rc
        ON rc.symbol_token = c.symbol_token
      LEFT JOIN willr_calc wc
        ON wc.symbol_token = c.symbol_token
      ORDER BY c.symbol ASC
    `)
  ]);

  const asOf = new Date().toISOString();
  const indexBySymbol = new Map(indexRows.map((r) => [r.symbol, r]));

  const nifty = makeIndexQuote("NIFTY50", "NIFTY 50", indexBySymbol.get("NIFTY50") ?? null, asOf);
  const indices = {
    nifty50: nifty,
    bankNifty: makeIndexQuote("BANKNIFTY", "BANK NIFTY", indexBySymbol.get("BANKNIFTY") ?? null, asOf),
    indiaVix: makeIndexQuote("INDIAVIX", "INDIA VIX", indexBySymbol.get("INDIAVIX") ?? null, asOf)
  };

  const quotes = stockRows.map(asQuote);
  return buildOverviewFromQuotes(asOf, nifty, quotes, indices);
}

async function getSeedSchemaOverview(prisma: PrismaClient): Promise<OverviewPayload> {
  const asOf = new Date().toISOString();
  const stocks = await prisma.stock.findMany({
    where: {
      OR: [{ symbol: "NIFTY50" }, { isNifty100: true }]
    },
    include: { sector: true }
  });

  const stockIds = stocks.map((s) => s.id);
  const dayKey = marketDayKeyUtc();
  const dayStart = marketDayStartUtc();

  const dailyToday = await prisma.dailySnapshot.findMany({
    where: { stockId: { in: stockIds }, date: dayKey }
  });
  const dailyByStock = new Map(dailyToday.map((d) => [d.stockId, d]));

  if (dailyByStock.size < stockIds.length) {
    const latestDailyDates = await prisma.dailySnapshot.groupBy({
      by: ["stockId"],
      where: { stockId: { in: stockIds } },
      _max: { date: true }
    });

    const ors = latestDailyDates
      .filter((g) => g._max.date)
      .map((g) => ({ stockId: g.stockId, date: g._max.date! }));

    if (ors.length) {
      const latestRows = await prisma.dailySnapshot.findMany({ where: { OR: ors } });
      for (const row of latestRows) {
        if (!dailyByStock.has(row.stockId)) dailyByStock.set(row.stockId, row);
      }
    }
  }

  const latestTsByStock = await prisma.intradayBar.groupBy({
    by: ["stockId"],
    where: { stockId: { in: stockIds }, ts: { gte: dayStart } },
    _max: { ts: true }
  });

  const barOrs = latestTsByStock
    .filter((g) => g._max.ts)
    .map((g) => ({ stockId: g.stockId, ts: g._max.ts! }));

  const latestBars = barOrs.length ? await prisma.intradayBar.findMany({ where: { OR: barOrs } }) : [];

  const barByStock = new Map(latestBars.map((b) => [b.stockId, b]));

  const quotes: Quote[] = stocks
    .filter((s) => s.symbol !== "NIFTY50")
    .map((s) => {
      const daily = dailyByStock.get(s.id);
      const prevClose = daily ? toNumber(daily.prevClose) : 0;
      const dayClose = daily ? toNumber(daily.close) : 0;

      const bar = barByStock.get(s.id);
      const last = bar ? toNumber(bar.close) : dayClose;

      const change = last - prevClose;
      const changePct = prevClose ? (change / prevClose) * 100 : 0;

      return {
        symbol: s.symbol,
        name: s.name,
        sector:
          s.symbol === "TMCV" || s.symbol === "TMPV"
            ? "Automobile and Auto Components"
            : (s.sector?.name ?? "OTHER"),
        last,
        change,
        changePct,
        volume: bar ? toSafeVolume(bar.volume) : daily ? toSafeVolume(daily.volume) : null,
        timestamp: bar ? bar.ts.toISOString() : asOf,
        rsi: null,
        willr: null
      };
    });

  const niftyStock = stocks.find((s) => s.symbol === "NIFTY50");
  if (!niftyStock) {
    throw new Error("NIFTY50 not found");
  }
  const niftyDaily = dailyByStock.get(niftyStock.id);
  const niftyBar = barByStock.get(niftyStock.id);
  const prevClose = niftyDaily ? toNumber(niftyDaily.prevClose) : 0;
  const last = niftyBar ? toNumber(niftyBar.close) : niftyDaily ? toNumber(niftyDaily.close) : 0;
  const change = last - prevClose;
  const changePct = prevClose ? (change / prevClose) * 100 : 0;

  const nifty: Quote = {
    symbol: "NIFTY50",
    name: "NIFTY 50",
    sector: "INDEX",
    last,
    change,
    changePct,
    volume: niftyBar ? toSafeVolume(niftyBar.volume) : niftyDaily ? toSafeVolume(niftyDaily.volume) : null,
    timestamp: niftyBar ? niftyBar.ts.toISOString() : asOf,
    rsi: null,
    willr: null
  };

  const emptyIndex = (symbol: string, name: string): Quote => ({
    symbol,
    name,
    sector: "INDEX",
    last: 0,
    change: 0,
    changePct: 0,
    volume: 0,
    timestamp: asOf,
    rsi: null,
    willr: null
  });

  return buildOverviewFromQuotes(asOf, nifty, quotes, {
    nifty50: nifty,
    bankNifty: emptyIndex("BANKNIFTY", "BANK NIFTY"),
    indiaVix: emptyIndex("INDIAVIX", "INDIA VIX")
  });
}

export async function getOverview(prisma: PrismaClient): Promise<OverviewPayload> {
  try {
    return await getTradingStackOverview(prisma);
  } catch (err) {
    if (!isMissingRelationError(err)) throw err;
    return getSeedSchemaOverview(prisma);
  }
}

const OVERVIEW_SNAPSHOT_DEFINITION: SnapshotDefinition<OverviewPayload> = {
  key: "overview",
  cacheControl: "private, max-age=60, stale-while-revalidate=300",
  freshnessMs: 60_000,
  build: getOverview
};

async function loadOverviewSnapshot(prisma: PrismaClient) {
  const ttlSeconds = Math.ceil(OVERVIEW_SNAPSHOT_DEFINITION.freshnessMs / 1000);
  const snapshotDate = OVERVIEW_SNAPSHOT_DEFINITION.snapshotDate?.() ?? marketDayIso();
  const stored = await getStoredSnapshot<OverviewPayload>(prisma, OVERVIEW_SNAPSHOT_DEFINITION.key, snapshotDate, ttlSeconds);
  if (stored.record !== null) {
    return {
      record: stored.record,
      source: stored.source,
      freshnessMs: OVERVIEW_SNAPSHOT_DEFINITION.freshnessMs
    };
  }

  const record = await materializeSnapshot(prisma, OVERVIEW_SNAPSHOT_DEFINITION);
  return {
    record,
    source: "build" as const,
    freshnessMs: OVERVIEW_SNAPSHOT_DEFINITION.freshnessMs
  };
}

export async function getLeaderboard(prisma: PrismaClient, limit: number) {
  const overviewSnapshot = await loadOverviewSnapshot(prisma);
  const overview = overviewSnapshot.record.payload;
  const all = overview.sectors.flatMap((s) => s.stocks).sort((a, b) => b.changePct - a.changePct);
  const safeLimit = Math.max(1, Math.min(200, Math.trunc(limit) || 20));
  const ageMs = Date.now() - new Date(overviewSnapshot.record.generatedAt).getTime();
  return {
    asOf: overview.asOf,
    snapshot: {
      key: overviewSnapshot.record.snapshotKey,
      generatedAt: overviewSnapshot.record.generatedAt,
      source: overviewSnapshot.source,
      ageMs,
      fresh: ageMs <= overviewSnapshot.freshnessMs
    },
    items: all.slice(0, safeLimit),
    gainers: all.slice(0, safeLimit),
    losers: [...all].reverse().slice(0, safeLimit)
  };
}

export function registerOverview(app: Express, prisma: PrismaClient) {
  app.get("/v1/overview", async (req, res) => serveSnapshotRoute(req, res, prisma, OVERVIEW_SNAPSHOT_DEFINITION));

  app.get("/v1/leaderboard", async (req, res) => {
    const limit = Number(req.query.limit ?? 20);
    try {
      const payload = await getLeaderboard(prisma, limit);
      res.setHeader("Cache-Control", OVERVIEW_SNAPSHOT_DEFINITION.cacheControl);
      res.setHeader("X-Snapshot-Key", payload.snapshot.key);
      res.setHeader("X-Snapshot-Generated-At", payload.snapshot.generatedAt);
      res.setHeader("X-Snapshot-Source", payload.snapshot.source);
      res.setHeader("X-Snapshot-Age-Sec", String(Math.max(0, Math.floor(payload.snapshot.ageMs / 1000))));
      res.setHeader("X-Snapshot-Status", payload.snapshot.fresh ? "hit" : "stale");
      return res.json(payload);
    } catch (err) {
      return res.status(500).json({
        error: {
          code: "LEADERBOARD_FAILED",
          message: err instanceof Error ? err.message : "Unable to build leaderboard"
        }
      });
    }
  });
}
