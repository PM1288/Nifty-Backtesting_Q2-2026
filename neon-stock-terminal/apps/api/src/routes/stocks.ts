import type { Express } from "express";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { marketDayIso, marketDayKeyUtc, marketDayStartUtc } from "../lib/time";
import { toNumber, toSafeVolume } from "../lib/num";

const paramsSchema = z.object({
  symbol: z.string().min(1)
});

const rangeSchema = z.enum(["1D", "5D", "1M", "6M", "1Y"]).default("1D");

const RANGE_LIMITS: Record<z.infer<typeof rangeSchema>, number> = {
  "1D": 390,
  "5D": 5,
  "1M": 22,
  "6M": 126,
  "1Y": 252
};

type StackSymbolRow = {
  symbol_token: string;
  tradingsymbol: string;
  symbol: string;
  sector: string | null;
};

type StackStateRow = {
  last_price: number | null;
  net_change: number | null;
  percent_change: number | null;
  last_open: number | null;
  last_high: number | null;
  last_low: number | null;
  last_close: number | null;
  last_volume: number | string | null;
  last_seen_ts: Date | string | null;
};

type StackBar1DRow = {
  trade_date: Date | string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | string | null;
};

type StackBar1MRow = {
  ts: Date | string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | string | null;
};

type IndexAlias = {
  symbol: string;
  token: string;
  name: string;
};

const INDEX_ALIASES: Record<string, IndexAlias> = {
  NIFTY50: { symbol: "NIFTY50", token: "99926000", name: "NIFTY 50" },
  BANKNIFTY: { symbol: "BANKNIFTY", token: "99926009", name: "BANK NIFTY" },
  NIFTYBANK: { symbol: "BANKNIFTY", token: "99926009", name: "BANK NIFTY" },
  INDIAVIX: { symbol: "INDIAVIX", token: "99926017", name: "INDIA VIX" }
};

function toIso(ts: Date | string | null | undefined): string {
  if (!ts) return new Date().toISOString();
  if (ts instanceof Date) return ts.toISOString();
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function isMissingRelationError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return msg.includes("does not exist") || msg.includes("relation") || msg.includes("p2021") || msg.includes("42p01");
}

function dateKey(value: Date | string | null | undefined): string {
  if (!value) return "";
  return toIso(value).slice(0, 10);
}

async function getTradingStackStock(prisma: PrismaClient, symbolRaw: string, range: z.infer<typeof rangeSchema>) {
  const rawSymbol = symbolRaw.toUpperCase().trim();
  const normalizedSymbol = rawSymbol.replace(/[^A-Z0-9]/g, "");
  const indexAlias = INDEX_ALIASES[normalizedSymbol];
  const symbol = indexAlias?.symbol ?? rawSymbol;
  const asOf = new Date().toISOString();
  const sessionDate = marketDayIso();

  let symbolRow: StackSymbolRow | null = null;
  if (indexAlias) {
    symbolRow = {
      symbol_token: indexAlias.token,
      tradingsymbol: indexAlias.name,
      symbol: indexAlias.symbol,
      sector: "INDEX"
    };
  } else {
    const symbolRows = await prisma.$queryRaw<StackSymbolRow[]>(Prisma.sql`
      SELECT DISTINCT ON (iu.symbol_token)
        iu.symbol_token,
        iu.tradingsymbol,
        UPPER(REGEXP_REPLACE(TRIM(iu.tradingsymbol), '-EQ$', '')) AS symbol,
        CASE
          WHEN UPPER(REGEXP_REPLACE(TRIM(iu.tradingsymbol), '-EQ$', '')) IN ('TMCV', 'TMPV')
            THEN 'Automobile and Auto Components'
          ELSE COALESCE(
            NULLIF(TRIM(ic.sector), ''),
            NULLIF(TRIM(ic.industry), ''),
            NULLIF(TRIM(ic.basic_industry), ''),
            'OTHER'
          )
        END AS sector
      FROM instrument_universe iu
      LEFT JOIN LATERAL (
        SELECT c.sector, c.industry, c.basic_industry
        FROM index_constituents c
        WHERE UPPER(TRIM(c.symbol)) = UPPER(REGEXP_REPLACE(TRIM(iu.tradingsymbol), '-EQ$', ''))
        ORDER BY c.updated_at DESC
        LIMIT 1
      ) ic ON TRUE
      WHERE iu.exchange = 'NSE'
        AND iu.active_to IS NULL
        AND (
          UPPER(TRIM(iu.tradingsymbol)) = ${symbol}
          OR UPPER(REGEXP_REPLACE(TRIM(iu.tradingsymbol), '-EQ$', '')) = ${symbol}
        )
      ORDER BY iu.symbol_token, iu.active_from DESC NULLS LAST
      LIMIT 1
    `);
    symbolRow = symbolRows[0] ?? null;
  }

  if (!symbolRow) {
    return null;
  }

  const dailyLimit =
    range === "1Y" ? 400 : range === "6M" ? 180 : range === "1M" ? 80 : range === "5D" ? 30 : 20;

  const [stateRows, dailyRows] = await Promise.all([
    prisma.$queryRaw<StackStateRow[]>(Prisma.sql`
      SELECT
        last_price,
        net_change,
        percent_change,
        last_open,
        last_high,
        last_low,
        last_close,
        last_volume,
        last_seen_ts
      FROM instrument_state
      WHERE exchange = 'NSE' AND symbol_token = ${symbolRow.symbol_token}
      ORDER BY last_seen_ts DESC
      LIMIT 1
    `),
    prisma.$queryRaw<StackBar1DRow[]>(Prisma.sql`
      SELECT trade_date, open, high, low, close, volume
      FROM bars_1d
      WHERE exchange = 'NSE' AND symbol_token = ${symbolRow.symbol_token}
      ORDER BY trade_date DESC
      LIMIT ${dailyLimit}
    `)
  ]);

  const state = stateRows[0] ?? null;
  const latestDailyBar = dailyRows[0] ?? null;
  const previousDailyBar = dailyRows[1] ?? null;
  let derivedPrevClose: number | null = null;
  let derivedDay: { prevClose: number; open: number; high: number; low: number; volume: number | string | null } | null =
    null;

  let bars: Array<{ t: string; o: number; h: number; l: number; c: number; v: number | string | null }> = [];

  if (range === "1D") {
    let intradayRows = await prisma.$queryRaw<StackBar1MRow[]>(Prisma.sql`
      SELECT ts, open, high, low, close, volume
      FROM bars_1m
      WHERE exchange = 'NSE'
        AND symbol_token = ${symbolRow.symbol_token}
        AND (ts AT TIME ZONE 'Asia/Kolkata')::date = ${sessionDate}::date
      ORDER BY ts ASC
      LIMIT ${RANGE_LIMITS["1D"]}
    `);

    if (!intradayRows.length) {
      intradayRows = await prisma.$queryRaw<StackBar1MRow[]>(Prisma.sql`
        SELECT ts, open, high, low, close, volume
        FROM bars_1m
        WHERE exchange = 'NSE'
          AND symbol_token = ${symbolRow.symbol_token}
        ORDER BY ts DESC
        LIMIT ${RANGE_LIMITS["1D"]}
      `);
      intradayRows = intradayRows.reverse();
    }

    bars = intradayRows.map((b) => ({
      t: toIso(b.ts),
      o: toNumber(b.open),
      h: toNumber(b.high),
      l: toNumber(b.low),
      c: toNumber(b.close),
      v: toSafeVolume(b.volume)
    }));

    if (intradayRows.length) {
      const sessionDate = dateKey(intradayRows[intradayRows.length - 1]!.ts);
      const prevDailyForSession = dailyRows.find((d) => dateKey(d.trade_date) < sessionDate) ?? null;
      derivedPrevClose = prevDailyForSession ? toNumber(prevDailyForSession.close) : toNumber(state?.last_close ?? 0);

      const first = intradayRows[0]!;
      let dayHigh = Number.NEGATIVE_INFINITY;
      let dayLow = Number.POSITIVE_INFINITY;
      let dayVolume = 0;

      for (const row of intradayRows) {
        const high = toNumber(row.high ?? row.close ?? row.open);
        const low = toNumber(row.low ?? row.close ?? row.open);
        dayHigh = Math.max(dayHigh, high);
        dayLow = Math.min(dayLow, low);
        dayVolume += toNumber(row.volume ?? 0);
      }

      const open = toNumber(first.open ?? first.close ?? 0);
      derivedDay = {
        prevClose: derivedPrevClose,
        open,
        high: Number.isFinite(dayHigh) ? dayHigh : open,
        low: Number.isFinite(dayLow) ? dayLow : open,
        volume: dayVolume > 0 ? dayVolume : toSafeVolume(state?.last_volume ?? null)
      };
    }
  } else {
    const limit = RANGE_LIMITS[range];
    bars = dailyRows
      .slice(0, limit)
      .reverse()
      .map((d) => ({
        t: toIso(d.trade_date),
        o: toNumber(d.open),
        h: toNumber(d.high),
        l: toNumber(d.low),
        c: toNumber(d.close),
        v: toSafeVolume(d.volume)
      }));
  }

  const prevClose =
    derivedPrevClose ??
    (previousDailyBar ? toNumber(previousDailyBar.close) : toNumber(state?.last_close ?? latestDailyBar?.close ?? 0));

  const lastFromBars = bars.length ? bars[bars.length - 1]!.c : toNumber(latestDailyBar?.close ?? 0);
  const last = state?.last_price != null ? toNumber(state.last_price) : lastFromBars;
  const change = state?.net_change != null ? toNumber(state.net_change) : last - prevClose;
  const changePct =
    state?.percent_change != null ? toNumber(state.percent_change) : prevClose ? (change / prevClose) * 100 : 0;

  return {
    asOf,
    range,
    stock: {
      symbol: symbolRow.symbol,
      name: symbolRow.tradingsymbol,
      sector: symbolRow.sector ?? null,
      last,
      change,
      changePct,
      volume: toSafeVolume(state?.last_volume ?? latestDailyBar?.volume ?? null),
      timestamp: toIso(state?.last_seen_ts ?? bars[bars.length - 1]?.t ?? asOf),
      day:
        derivedDay ??
        (latestDailyBar
          ? {
              prevClose,
              open: toNumber(latestDailyBar.open),
              high: toNumber(latestDailyBar.high),
              low: toNumber(latestDailyBar.low),
              volume: toSafeVolume(latestDailyBar.volume)
            }
          : null)
    },
    intraday: bars
  };
}

async function getSeedSchemaStock(prisma: PrismaClient, symbolRaw: string, range: z.infer<typeof rangeSchema>) {
  const symbol = symbolRaw.toUpperCase();
  const stock = await prisma.stock.findUnique({
    where: { symbol },
    include: { sector: true }
  });

  if (!stock) return null;

  const asOf = new Date().toISOString();
  const dayKey = marketDayKeyUtc();
  const dayStart = marketDayStartUtc();

  const latestSnapshots = await prisma.dailySnapshot.findMany({
    where: { stockId: stock.id },
    orderBy: { date: "desc" },
    take: 300
  });
  const daily = latestSnapshots.find((d) => d.date.getTime() === dayKey.getTime()) ?? latestSnapshots[0] ?? null;
  const prevSnapshot = latestSnapshots[1] ?? null;
  const prevClose = prevSnapshot ? toNumber(prevSnapshot.close) : daily ? toNumber(daily.prevClose) : 0;

  let intradayBars = await prisma.intradayBar.findMany({
    where: { stockId: stock.id, ts: { gte: dayStart } },
    orderBy: { ts: "asc" },
    take: 800
  });
  if (!intradayBars.length) {
    intradayBars = await prisma.intradayBar.findMany({
      where: { stockId: stock.id },
      orderBy: { ts: "desc" },
      take: 390
    });
    intradayBars = intradayBars.reverse();
  }

  let bars: Array<{ t: string; o: number; h: number; l: number; c: number; v: number | string | null }>;
  if (range === "1D") {
    bars = intradayBars.map((b) => ({
      t: b.ts.toISOString(),
      o: toNumber(b.open),
      h: toNumber(b.high),
      l: toNumber(b.low),
      c: toNumber(b.close),
      v: toSafeVolume(b.volume)
    }));
  } else {
    bars = latestSnapshots
      .slice(0, RANGE_LIMITS[range])
      .reverse()
      .map((d) => ({
        t: d.date.toISOString(),
        o: toNumber(d.open),
        h: toNumber(d.high),
        l: toNumber(d.low),
        c: toNumber(d.close),
        v: toSafeVolume(d.volume)
      }));
  }

  const last = bars.length ? bars[bars.length - 1]!.c : daily ? toNumber(daily.close) : 0;
  const change = last - prevClose;
  const changePct = prevClose ? (change / prevClose) * 100 : 0;

  return {
    asOf,
    range,
    stock: {
      symbol: stock.symbol,
      name: stock.name,
      sector:
        stock.symbol === "TMCV" || stock.symbol === "TMPV"
          ? "Automobile and Auto Components"
          : (stock.sector?.name ?? null),
      last,
      change,
      changePct,
      volume: daily ? toSafeVolume(daily.volume) : null,
      timestamp: bars.length ? bars[bars.length - 1]!.t : asOf,
      day: daily
        ? {
            prevClose: daily ? toNumber(daily.prevClose) : prevClose,
            open: toNumber(daily.open),
            high: toNumber(daily.high),
            low: toNumber(daily.low),
            volume: toSafeVolume(daily.volume)
          }
        : null
    },
    intraday: bars
  };
}

export function registerStocks(app: Express, prisma: PrismaClient) {
  app.get("/v1/stocks/:symbol", async (req, res) => {
    const parsed = paramsSchema.safeParse(req.params);
    if (!parsed.success) {
      return res.status(400).json({ error: { code: "BAD_PARAMS", message: "Invalid symbol" } });
    }

    const rangeParsed = rangeSchema.safeParse((req.query.range ?? "1D").toString().toUpperCase());
    if (!rangeParsed.success) {
      return res.status(400).json({ error: { code: "BAD_RANGE", message: "Use one of 1D,5D,1M,6M,1Y" } });
    }
    const range = rangeParsed.data;

    try {
      const payload = await getTradingStackStock(prisma, parsed.data.symbol, range);
      if (!payload) {
        return res.status(404).json({ error: { code: "NOT_FOUND", message: "Symbol not found" } });
      }
      return res.json(payload);
    } catch (err) {
      if (!isMissingRelationError(err)) {
        return res.status(500).json({
          error: { code: "STOCK_FETCH_FAILED", message: err instanceof Error ? err.message : "Failed to fetch stock" }
        });
      }
    }

    const fallback = await getSeedSchemaStock(prisma, parsed.data.symbol, range);
    if (!fallback) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Symbol not found" } });
    }
    return res.json(fallback);
  });
}
