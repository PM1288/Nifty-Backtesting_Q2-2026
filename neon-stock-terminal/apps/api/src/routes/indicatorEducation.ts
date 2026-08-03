import type { Express } from "express";
import { Prisma, type PrismaClient } from "@prisma/client";
import { DateTime } from "luxon";

type IndicatorSnapshotRow = {
  batch_run_id: bigint | number;
  data_as_of_date: Date | string;
  generated_at: Date | string;
  stale_after: Date | string | null;
  payload_json: unknown;
};

function toIsoDate(value: Date | string | null | undefined): string {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function toIsoDateTime(value: Date | string | null | undefined): string {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

function clonePayload<T>(payload: T): T {
  return JSON.parse(JSON.stringify(payload)) as T;
}

function computeStale(dataAsOfDate: string, staleAfter: string | null) {
  if (staleAfter) {
    const staleDt = DateTime.fromISO(staleAfter);
    if (staleDt.isValid) {
      return DateTime.utc() > staleDt;
    }
  }
  const asOfDt = DateTime.fromISO(dataAsOfDate);
  if (!asOfDt.isValid) return true;
  return DateTime.utc().diff(asOfDt.startOf("day"), "days").days > 5;
}

function applyIndicatorFreshness(payload: unknown, row: IndicatorSnapshotRow) {
  const next = clonePayload(payload as Record<string, unknown>) as Record<string, any>;
  const dataAsOfDate = toIsoDate(row.data_as_of_date);
  const generatedAt = toIsoDateTime(row.generated_at);
  const stale = computeStale(dataAsOfDate, row.stale_after ? toIsoDateTime(row.stale_after) : null);

  const freshness = (next.freshness ?? {}) as Record<string, any>;
  const evidenceStartDate = typeof freshness.evidenceStartDate === "string" ? freshness.evidenceStartDate : "";
  next.freshness = {
    ...freshness,
    snapshotGeneratedAt: generatedAt || freshness.snapshotGeneratedAt,
    lastMarketDate: dataAsOfDate || freshness.lastMarketDate,
    currentStatusDate: dataAsOfDate || freshness.currentStatusDate,
    evidenceEndDate: dataAsOfDate || freshness.evidenceEndDate,
    evidenceRangeLabel: evidenceStartDate ? `${evidenceStartDate} to ${dataAsOfDate}` : freshness.evidenceRangeLabel
  };

  if (next.currentStatus && typeof next.currentStatus === "object") {
    next.currentStatus = {
      ...next.currentStatus,
      asOf: generatedAt || next.currentStatus.asOf,
      tradeDate: dataAsOfDate || next.currentStatus.tradeDate,
      isStale: stale
    };
  }

  if (next.evidence && typeof next.evidence === "object") {
    next.evidence = {
      ...next.evidence,
      isStale: stale
    };
  }

  const scenarios = next.strategyEvaluator?.scenarios;
  if (Array.isArray(scenarios)) {
    next.strategyEvaluator = {
      ...next.strategyEvaluator,
      scenarios: scenarios.map((scenario) => ({
        ...scenario,
        isStale: stale
      }))
    };
  }

  return {
    payload: next,
    stale,
    batchRunId: typeof row.batch_run_id === "bigint" ? Number(row.batch_run_id) : row.batch_run_id,
    dataAsOfDate,
    generatedAt
  };
}

async function loadIndicatorSnapshot(prisma: PrismaClient, slug: string) {
  const rows = await prisma.$queryRaw<IndicatorSnapshotRow[]>(Prisma.sql`
    WITH latest_batch AS (
      SELECT batch_run_id, data_as_of_date, generated_at, stale_after
      FROM nse_app.batch_run_audit
      WHERE batch_name = 'indicator_strategy_precompute'
        AND published_flag = TRUE
      ORDER BY published_at DESC NULLS LAST, generated_at DESC
      LIMIT 1
    )
    SELECT
      b.batch_run_id,
      b.data_as_of_date,
      b.generated_at,
      b.stale_after,
      s.payload_json
    FROM latest_batch b
    JOIN nse_app.indicator_summary_snapshot s
      ON s.batch_run_id = b.batch_run_id
    WHERE s.indicator_slug = ${slug}
    ORDER BY s.snapshot_date DESC
    LIMIT 1
  `);
  return rows[0] ?? null;
}

export function registerIndicatorEducation(app: Express, prisma: PrismaClient) {
  app.get("/v1/analytics/indicators/:slug", async (req, res) => {
    const slug = String(req.params.slug ?? "").trim().toLowerCase();
    if (!slug) {
      return res.status(404).json({
        error: {
          code: "INDICATOR_NOT_FOUND",
          message: "Indicator is required."
        }
      });
    }

    try {
      const row = await loadIndicatorSnapshot(prisma, slug);
      if (!row) {
        return res.status(404).json({
          error: {
            code: "INDICATOR_SNAPSHOT_NOT_FOUND",
            message: `No published indicator snapshot exists for '${slug}'.`
          }
        });
      }

      const hydrated = applyIndicatorFreshness(row.payload_json, row);
      res.setHeader("Cache-Control", "private, max-age=300, stale-while-revalidate=300");
      res.setHeader("X-Indicator-Batch-Id", String(hydrated.batchRunId));
      res.setHeader("X-Data-As-Of-Date", hydrated.dataAsOfDate);
      res.setHeader("X-Snapshot-Generated-At", hydrated.generatedAt);
      res.setHeader("X-Snapshot-Stale", hydrated.stale ? "true" : "false");
      return res.json(hydrated.payload);
    } catch (err) {
      return res.status(500).json({
        error: {
          code: "INDICATOR_SNAPSHOT_LOAD_FAILED",
          message: err instanceof Error ? err.message : "Unable to load the published indicator snapshot."
        }
      });
    }
  });
}
