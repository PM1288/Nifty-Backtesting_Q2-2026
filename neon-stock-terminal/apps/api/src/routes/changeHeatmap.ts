import type { Express } from "express";
import { Prisma, type PrismaClient } from "@prisma/client";
import { DateTime } from "luxon";
import { MARKET_TZ, effectiveMarketDay, marketNow } from "../lib/time";
import { serveSnapshotRoute } from "../lib/dashboardSnapshots";
import { getOverview, type Quote } from "./overview";

type UniverseRow = {
  symbol_token: string;
  symbol: string;
  name: string;
  sector: string | null;
};

type SurfaceRawRow = {
  symbol: string;
  ts: Date | string | null;
  close: number | null;
};

type SurfaceRow = {
  symbol: string;
  name: string;
  sector: string;
  last: number;
  changePct: number;
  latestChangePct: number;
};

type SurfaceSector = {
  sector: string;
  startIndex: number;
  count: number;
  avgChangePct: number;
  rows: SurfaceRow[];
};

type SurfacePayload = {
  asOf: string;
  refreshSeconds: number;
  tradeDate: string;
  session: {
    start: string;
    end: string;
  };
  timestamps: string[];
  rows: SurfaceRow[];
  sectors: SurfaceSector[];
  values: number[][];
  planes: {
    lower: number;
    upper: number;
  };
  colorScale: {
    min: number;
    max: number;
    center: number;
  };
  stats: {
    min: number;
    max: number;
    avg: number;
    niftyChangePct: number | null;
    universeAvgChangePct: number;
  };
  indices: {
    nifty50: Quote;
    bankNifty: Quote;
    indiaVix: Quote;
  };
};

type SurfaceCacheEntry = {
  key: string;
  expiresAt: number;
  payload: SurfacePayload;
};

const CACHE_TTL_MS = 30_000;
const MARKET_OPEN_HOUR = 9;
const MARKET_OPEN_MINUTE = 15;
const MARKET_CLOSE_HOUR = 15;
const MARKET_CLOSE_MINUTE = 30;

let cacheEntry: SurfaceCacheEntry | null = null;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toIso(ts: Date | string | null | undefined): string | null {
  if (!ts) return null;
  if (ts instanceof Date) return ts.toISOString();
  const parsed = new Date(ts);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function toFinite(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function buildMinuteTimeline(day: DateTime): DateTime[] {
  const start = day.set({
    hour: MARKET_OPEN_HOUR,
    minute: MARKET_OPEN_MINUTE,
    second: 0,
    millisecond: 0
  });
  const end = day.set({
    hour: MARKET_CLOSE_HOUR,
    minute: MARKET_CLOSE_MINUTE,
    second: 0,
    millisecond: 0
  });

  const slots: DateTime[] = [];
  for (let cursor = start; cursor <= end; cursor = cursor.plus({ minutes: 1 })) {
    slots.push(cursor);
  }
  return slots;
}

function previousWeekday(day: DateTime): DateTime {
  let next = day.minus({ days: 1 }).startOf("day");
  while (next.weekday > 5) {
    next = next.minus({ days: 1 }).startOf("day");
  }
  return next;
}

async function fetchUniverse(prisma: PrismaClient): Promise<UniverseRow[]> {
  return prisma.$queryRaw<UniverseRow[]>(Prisma.sql`
    WITH universe AS (
      SELECT DISTINCT ON (iu.symbol_token)
        iu.symbol_token,
        UPPER(REGEXP_REPLACE(TRIM(iu.tradingsymbol), '-EQ$', '')) AS symbol,
        iu.tradingsymbol AS name
      FROM instrument_universe iu
      WHERE iu.exchange = 'NSE'
        AND iu.universe_name = 'nifty100_equity'
        AND iu.active_to IS NULL
        AND COALESCE(TRIM(iu.tradingsymbol), '') <> ''
      ORDER BY iu.symbol_token, iu.active_from DESC NULLS LAST
    )
    SELECT
      u.symbol_token,
      u.symbol,
      u.name,
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
    ORDER BY sector ASC, symbol ASC
  `);
}

async function resolveTradingSessionDay(prisma: PrismaClient): Promise<DateTime> {
  let candidate = effectiveMarketDay(marketNow());

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const sessionStart = candidate
      .set({ hour: MARKET_OPEN_HOUR, minute: MARKET_OPEN_MINUTE, second: 0, millisecond: 0 })
      .toUTC()
      .toJSDate();
    const sessionEnd = candidate
      .set({ hour: MARKET_CLOSE_HOUR, minute: MARKET_CLOSE_MINUTE, second: 0, millisecond: 0 })
      .toUTC()
      .toJSDate();

    const rows = await prisma.$queryRaw<Array<{ found: number }>>(Prisma.sql`
      SELECT 1 AS found
      FROM bars_1m b
      WHERE b.exchange = 'NSE'
        AND b.ts >= ${sessionStart}
        AND b.ts <= ${sessionEnd}
      LIMIT 1
    `);

    if (rows.length) return candidate;
    candidate = previousWeekday(candidate);
  }

  return effectiveMarketDay(marketNow());
}

async function fetchIntradayRows(prisma: PrismaClient, universe: UniverseRow[], tradeDay: DateTime): Promise<SurfaceRawRow[]> {
  const sessionStart = tradeDay
    .set({ hour: MARKET_OPEN_HOUR, minute: MARKET_OPEN_MINUTE, second: 0, millisecond: 0 })
    .toUTC()
    .toJSDate();
  const sessionEnd = tradeDay
    .set({ hour: MARKET_CLOSE_HOUR, minute: MARKET_CLOSE_MINUTE, second: 0, millisecond: 0 })
    .toUTC()
    .toJSDate();
  if (!universe.length) return [];

  return prisma.$queryRaw<SurfaceRawRow[]>(Prisma.sql`
    WITH universe AS (
      SELECT DISTINCT ON (iu.symbol_token)
        iu.symbol_token,
        UPPER(REGEXP_REPLACE(TRIM(iu.tradingsymbol), '-EQ$', '')) AS symbol
      FROM instrument_universe iu
      WHERE iu.exchange = 'NSE'
        AND iu.universe_name = 'nifty100_equity'
        AND iu.active_to IS NULL
      ORDER BY iu.symbol_token, iu.active_from DESC NULLS LAST
    )
    SELECT
      u.symbol,
      b.ts,
      b.close::double precision AS close
    FROM bars_1m b
    JOIN universe u ON u.symbol_token = b.symbol_token
    WHERE b.exchange = 'NSE'
      AND b.ts >= ${sessionStart}
      AND b.ts <= ${sessionEnd}
    ORDER BY u.symbol ASC, b.ts ASC
  `);
}

function emptyPayload(asOf: string, indices: SurfacePayload["indices"]): SurfacePayload {
  const day = effectiveMarketDay(marketNow());
  const timeline = buildMinuteTimeline(day);
  return {
    asOf,
    refreshSeconds: 60,
    tradeDate: day.toISODate() ?? "",
    session: {
      start: timeline[0]?.toISO() ?? asOf,
      end: timeline[timeline.length - 1]?.toISO() ?? asOf
    },
    timestamps: timeline.map((slot) => slot.toISO() ?? asOf),
    rows: [],
    sectors: [],
    values: [],
    planes: { lower: -2, upper: 2 },
    colorScale: { min: -4, max: 4, center: 0 },
    stats: {
      min: 0,
      max: 0,
      avg: 0,
      niftyChangePct: indices.nifty50.changePct ?? null,
      universeAvgChangePct: 0
    },
    indices
  };
}

export async function buildChangeHeatmapPayload(prisma: PrismaClient): Promise<SurfacePayload> {
  const asOf = new Date().toISOString();
  const overview = await getOverview(prisma);
  const indices = overview.indices;
  const universe = await fetchUniverse(prisma);
  if (!universe.length) return emptyPayload(asOf, indices);

  const tradeDay = await resolveTradingSessionDay(prisma);
  const timeline = buildMinuteTimeline(tradeDay);
  const timelineIso = timeline.map((slot) => slot.toUTC().toISO() ?? asOf);
  const overviewQuoteBySymbol = new Map(
    overview.sectors.flatMap((sector) => sector.stocks).map((quote) => [quote.symbol, quote] as const)
  );

  const rawRows = await fetchIntradayRows(prisma, universe, tradeDay);
  const barsBySymbol = new Map<string, Array<{ ts: string; close: number }>>();

  for (const row of rawRows) {
    const ts = toIso(row.ts);
    const close = toFinite(row.close);
    if (!ts || close == null) continue;
    if (!barsBySymbol.has(row.symbol)) barsBySymbol.set(row.symbol, []);
    barsBySymbol.get(row.symbol)!.push({ ts, close });
  }

  const sectorMap = new Map<string, SurfaceRow[]>();
  const surfaceRows: SurfaceRow[] = [];
  const values: number[][] = [];
  const allNumbers: number[] = [];

  for (const item of universe) {
    const quote = overviewQuoteBySymbol.get(item.symbol);
    const bars = barsBySymbol.get(item.symbol) ?? [];
    const firstClose = bars[0]?.close ?? null;
    const rowValues: number[] = [];
    let carry = quote?.changePct ?? 0;

    for (const ts of timelineIso) {
      const bar = bars.find((entry) => entry.ts === ts);
      if (bar && firstClose && Math.abs(firstClose) > 1e-9) {
        carry = ((bar.close - firstClose) / firstClose) * 100;
      }
      rowValues.push(Number(carry.toFixed(2)));
      allNumbers.push(carry);
    }

    const latestChangePct = rowValues[rowValues.length - 1] ?? carry;
    const row: SurfaceRow = {
      symbol: item.symbol,
      name: quote?.name ?? item.name ?? item.symbol,
      sector: item.sector ?? "OTHER",
      last: quote?.last ?? 0,
      changePct: quote?.changePct ?? 0,
      latestChangePct: Number(latestChangePct.toFixed(2))
    };

    if (!sectorMap.has(row.sector)) sectorMap.set(row.sector, []);
    sectorMap.get(row.sector)!.push(row);
    surfaceRows.push(row);
    values.push(rowValues);
  }

  const sortedSectors = [...sectorMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([sector, rows]) => ({
      sector,
      rows: [...rows].sort((a, b) => {
        if (b.latestChangePct !== a.latestChangePct) return b.latestChangePct - a.latestChangePct;
        return a.symbol.localeCompare(b.symbol);
      })
    }));

  const rowIndexBySymbol = new Map(surfaceRows.map((row, index) => [row.symbol, index]));
  const orderedRows: SurfaceRow[] = [];
  const orderedValues: number[][] = [];
  const sectors: SurfaceSector[] = [];
  let cursor = 0;

  for (const entry of sortedSectors) {
    const rows = entry.rows.map((row) => {
      const sourceIndex = rowIndexBySymbol.get(row.symbol);
      if (sourceIndex == null) return row;
      orderedRows.push(row);
      orderedValues.push(values[sourceIndex]!);
      return row;
    });

    const avgChangePct = rows.length ? rows.reduce((sum, row) => sum + row.latestChangePct, 0) / rows.length : 0;
    sectors.push({
      sector: entry.sector,
      startIndex: cursor,
      count: rows.length,
      avgChangePct: Number(avgChangePct.toFixed(2)),
      rows
    });
    cursor += rows.length;
  }

  const min = allNumbers.length ? Math.min(...allNumbers) : 0;
  const max = allNumbers.length ? Math.max(...allNumbers) : 0;
  const avg = allNumbers.length ? allNumbers.reduce((sum, value) => sum + value, 0) / allNumbers.length : 0;
  const bound = Math.max(2, Math.ceil(Math.max(Math.abs(min), Math.abs(max))));

  return {
    asOf,
    refreshSeconds: 60,
    tradeDate: tradeDay.toISODate() ?? "",
    session: {
      start: timeline[0]?.toISO() ?? asOf,
      end: timeline[timeline.length - 1]?.toISO() ?? asOf
    },
    timestamps: timeline.map((slot) => slot.toISO() ?? asOf),
    rows: orderedRows,
    sectors,
    values: orderedValues,
    planes: { lower: -2, upper: 2 },
    colorScale: { min: -bound, max: bound, center: 0 },
    stats: {
      min: Number(min.toFixed(2)),
      max: Number(max.toFixed(2)),
      avg: Number(avg.toFixed(2)),
      niftyChangePct: indices.nifty50.changePct ?? null,
      universeAvgChangePct: Number(
        (orderedRows.reduce((sum, row) => sum + row.latestChangePct, 0) / Math.max(1, orderedRows.length)).toFixed(2)
      )
    },
    indices
  };
}

export function registerChangeHeatmap(app: Express, prisma: PrismaClient) {
  app.get("/v1/change-heatmap", async (req, res) =>
    serveSnapshotRoute(req, res, prisma, {
      key: "heatmap-change",
      cacheControl: "private, max-age=60, stale-while-revalidate=300",
      freshnessMs: CACHE_TTL_MS,
      snapshotDate: () => effectiveMarketDay(marketNow()).toISODate() ?? "unknown",
      build: async (db) => {
        const cacheKey = `${effectiveMarketDay(marketNow()).toISODate() ?? "unknown"}:${MARKET_TZ}`;
        const now = Date.now();

        if (cacheEntry && cacheEntry.key === cacheKey && cacheEntry.expiresAt > now) {
          return cacheEntry.payload;
        }

        const payload = await buildChangeHeatmapPayload(db);
        cacheEntry = {
          key: cacheKey,
          expiresAt: now + CACHE_TTL_MS,
          payload
        };
        return payload;
      }
    })
  );
}
