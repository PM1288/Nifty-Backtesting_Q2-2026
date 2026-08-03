import type { Express } from "express";
import { Prisma, type PrismaClient } from "@prisma/client";

type LatestEventManifestRow = {
  run_id: string;
  created_at: Date | string | null;
  row_count: bigint | number | null;
  combined_file: string | null;
};

type EventCalendarRow = {
  run_id: string;
  symbol: string;
  company_name: string | null;
  purpose: string | null;
  details: string | null;
  event_date: Date | string | null;
  attachment: string | null;
  broadcast_datetime: Date | string | null;
  source: string;
};

type HeatmapRow = {
  event_date: Date | string | null;
  event_count: bigint | number | null;
};

type TopSymbolRow = {
  symbol: string;
  event_count: bigint | number | null;
};

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function toDateKey(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function toInt(value: bigint | number | null | undefined): number {
  if (typeof value === "bigint") return Number(value);
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : 0;
}

export async function getAnalyticsEvents(prisma: PrismaClient) {
  const [latestManifest] = await prisma.$queryRaw<LatestEventManifestRow[]>(Prisma.sql`
    SELECT
      run_id,
      created_at,
      row_count,
      combined_file
    FROM audit.load_manifest
    WHERE dataset_name = 'nse_event_calendar'
      AND status = 'loaded'
    ORDER BY created_at DESC
    LIMIT 1
  `);

  if (!latestManifest?.run_id) {
    return {
      asOf: new Date().toISOString(),
      latestRunId: null,
      latestLoadedAt: null,
      latestCombinedFile: null,
      summary: {
        totalEvents: 0,
        uniqueSymbols: 0,
        upcomingEvents: 0,
        attachmentCount: 0,
        loadedRowCount: 0,
        dateRange: {
          start: null,
          end: null
        },
        busiestDay: {
          date: null,
          count: 0
        }
      },
      symbols: [],
      topSymbols: [],
      heatmap: [],
      events: []
    };
  }

  const [eventRows, heatmapRows, topSymbolRows] = await Promise.all([
    prisma.$queryRaw<EventCalendarRow[]>(Prisma.sql`
      SELECT
        run_id,
        symbol,
        company_name,
        purpose,
        details,
        event_date,
        attachment,
        broadcast_datetime,
        source
      FROM market_data.nse_event_calendar
      WHERE run_id = ${latestManifest.run_id}
      ORDER BY event_date DESC NULLS LAST, broadcast_datetime DESC NULLS LAST, symbol ASC
    `),
    prisma.$queryRaw<HeatmapRow[]>(Prisma.sql`
      SELECT
        event_date,
        COUNT(*)::bigint AS event_count
      FROM market_data.nse_event_calendar
      WHERE run_id = ${latestManifest.run_id}
        AND event_date IS NOT NULL
      GROUP BY event_date
      ORDER BY event_date ASC
    `),
    prisma.$queryRaw<TopSymbolRow[]>(Prisma.sql`
      SELECT
        symbol,
        COUNT(*)::bigint AS event_count
      FROM market_data.nse_event_calendar
      WHERE run_id = ${latestManifest.run_id}
      GROUP BY symbol
      ORDER BY event_count DESC, symbol ASC
      LIMIT 12
    `)
  ]);

  const todayKey = new Date().toISOString().slice(0, 10);
  const attachmentCount = eventRows.reduce((total, row) => total + (row.attachment ? 1 : 0), 0);
  const uniqueSymbols = new Set(eventRows.map((row) => row.symbol).filter(Boolean));
  const datedEvents = eventRows
    .map((row) => toDateKey(row.event_date))
    .filter((value): value is string => Boolean(value));
  const upcomingEvents = datedEvents.filter((dateKey) => dateKey >= todayKey).length;
  const sortedHeatmap = heatmapRows
    .map((row) => ({
      date: toDateKey(row.event_date),
      count: toInt(row.event_count)
    }))
    .filter((row): row is { date: string; count: number } => Boolean(row.date));
  const busiestDay = sortedHeatmap.reduce<{ date: string | null; count: number }>(
    (current, row) => (row.count > current.count ? row : current),
    { date: null, count: 0 }
  );

  return {
    asOf: new Date().toISOString(),
    latestRunId: latestManifest.run_id,
    latestLoadedAt: toIso(latestManifest.created_at),
    latestCombinedFile: latestManifest.combined_file,
    summary: {
      totalEvents: eventRows.length,
      uniqueSymbols: uniqueSymbols.size,
      upcomingEvents,
      attachmentCount,
      loadedRowCount: toInt(latestManifest.row_count),
      dateRange: {
        start: sortedHeatmap[0]?.date ?? null,
        end: sortedHeatmap.at(-1)?.date ?? null
      },
      busiestDay
    },
    symbols: [...uniqueSymbols].sort((left, right) => left.localeCompare(right)),
    topSymbols: topSymbolRows.map((row) => ({
      symbol: row.symbol,
      count: toInt(row.event_count)
    })),
    heatmap: sortedHeatmap,
    events: eventRows.map((row) => ({
      runId: row.run_id,
      symbol: row.symbol,
      companyName: row.company_name,
      purpose: row.purpose,
      details: row.details,
      eventDate: toDateKey(row.event_date),
      broadcastDatetime: toIso(row.broadcast_datetime),
      attachment: row.attachment,
      source: row.source
    }))
  };
}

export function registerAnalyticsEvents(app: Express, prisma: PrismaClient) {
  app.get("/v1/analytics/events", async (_req, res) => {
    try {
      const payload = await getAnalyticsEvents(prisma);
      res.setHeader("Cache-Control", "private, max-age=300, stale-while-revalidate=300");
      return res.json(payload);
    } catch (error) {
      return res.status(500).json({
        error: {
          code: "ANALYTICS_EVENTS_FAILED",
          message: error instanceof Error ? error.message : "Unable to build analytics events payload"
        }
      });
    }
  });
}
