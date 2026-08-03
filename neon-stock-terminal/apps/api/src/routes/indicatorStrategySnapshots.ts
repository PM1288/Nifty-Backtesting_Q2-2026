import type { Express } from "express";
import { Prisma, type PrismaClient } from "@prisma/client";
import { DateTime } from "luxon";

type StrategySnapshotRow = {
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
    if (staleDt.isValid) return DateTime.utc() > staleDt;
  }
  const asOfDt = DateTime.fromISO(dataAsOfDate);
  if (!asOfDt.isValid) return true;
  return DateTime.utc().diff(asOfDt.startOf("day"), "days").days > 5;
}

async function loadStrategySnapshot(prisma: PrismaClient, slug: string, scenarioId: string) {
  const rows = await prisma.$queryRaw<StrategySnapshotRow[]>(Prisma.sql`
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
    JOIN nse_app.strategy_summary_snapshot s
      ON s.batch_run_id = b.batch_run_id
    WHERE s.indicator_slug = ${slug}
      AND s.scenario_id = ${scenarioId}
    ORDER BY s.snapshot_date DESC
    LIMIT 1
  `);
  return rows[0] ?? null;
}

export function registerIndicatorStrategySnapshots(app: Express, prisma: PrismaClient) {
  app.get("/v1/analytics/indicators/:slug/strategies/:scenarioId", async (req, res) => {
    const slug = String(req.params.slug ?? "").trim().toLowerCase();
    const scenarioId = String(req.params.scenarioId ?? "").trim().toLowerCase();
    if (!slug || !scenarioId) {
      return res.status(404).json({
        error: {
          code: "STRATEGY_SNAPSHOT_NOT_FOUND",
          message: "Indicator slug and scenario id are required."
        }
      });
    }

    try {
      const row = await loadStrategySnapshot(prisma, slug, scenarioId);
      if (!row) {
        return res.status(404).json({
          error: {
            code: "STRATEGY_SNAPSHOT_NOT_FOUND",
            message: `No published strategy snapshot exists for '${scenarioId}'.`
          }
        });
      }

      const next = clonePayload(row.payload_json as Record<string, unknown>) as Record<string, any>;
      const dataAsOfDate = toIsoDate(row.data_as_of_date);
      const generatedAt = toIsoDateTime(row.generated_at);
      const stale = computeStale(dataAsOfDate, row.stale_after ? toIsoDateTime(row.stale_after) : null);
      next.generatedAt = generatedAt || next.generatedAt;
      next.dataAsOfDate = dataAsOfDate || next.dataAsOfDate;
      next.isStale = stale;

      res.setHeader("Cache-Control", "private, max-age=300, stale-while-revalidate=300");
      res.setHeader("X-Strategy-Batch-Id", String(typeof row.batch_run_id === "bigint" ? Number(row.batch_run_id) : row.batch_run_id));
      res.setHeader("X-Data-As-Of-Date", dataAsOfDate);
      res.setHeader("X-Snapshot-Generated-At", generatedAt);
      res.setHeader("X-Snapshot-Stale", stale ? "true" : "false");
      return res.json(next);
    } catch (err) {
      return res.status(500).json({
        error: {
          code: "STRATEGY_SNAPSHOT_LOAD_FAILED",
          message: err instanceof Error ? err.message : "Unable to load the published strategy snapshot."
        }
      });
    }
  });
}
