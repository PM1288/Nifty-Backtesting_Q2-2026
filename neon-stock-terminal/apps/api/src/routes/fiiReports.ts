import type { Express } from "express";
import { z } from "zod";
import {
  createFiiReportsClient,
  type FiiReportsBackfillRequest,
  type FiiReportsClient,
  type FiiReportsLatestPullRequest,
  type FiiReportsLoadRequest
} from "../lib/fiiReportsClient";

const latestRequestSchema = z
  .object({
    as_of_date: z.string().trim().min(1).optional(),
    max_lookback_days: z.number().int().positive().max(60).optional(),
    save_parsed: z.boolean().optional()
  })
  .strict();

const backfillRequestSchema = z
  .object({
    start_date: z.string().trim().min(1),
    end_date: z.string().trim().min(1),
    save_parsed: z.boolean().optional(),
    continue_on_error: z.boolean().optional()
  })
  .strict();

const loadRequestSchema = z
  .object({
    kind: z.enum(["daily", "backfill"]).optional(),
    run_id: z.string().trim().min(1).optional(),
    truncate_tables_on_load: z.boolean().optional()
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.run_id && !value.kind) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["kind"],
        message: "kind is required when run_id is provided"
      });
    }
  });

function statusFromProxyError(error: unknown) {
  if (!(error instanceof Error)) return 502;
  const statusMatch = error.message.match(/FII reports service (\d{3})/);
  if (statusMatch) {
    return Number(statusMatch[1]);
  }
  if (/timeout/i.test(error.message)) {
    return 504;
  }
  return 502;
}

function proxyErrorPayload(code: string, error: unknown) {
  return {
    error: {
      code,
      message: error instanceof Error ? error.message : "FII reports service request failed."
    }
  };
}

export function registerFiiReports(
  app: Express,
  client: FiiReportsClient = createFiiReportsClient()
) {
  app.get("/v1/fii-reports/health", async (_req, res) => {
    try {
      return res.json(await client.getHealth());
    } catch (error) {
      return res.status(statusFromProxyError(error)).json(proxyErrorPayload("FII_REPORTS_HEALTH_FAILED", error));
    }
  });

  app.get("/v1/fii-reports/latest-run", async (_req, res) => {
    try {
      return res.json(await client.getLatestRun());
    } catch (error) {
      return res.status(statusFromProxyError(error)).json(proxyErrorPayload("FII_REPORTS_LATEST_RUN_FAILED", error));
    }
  });

  app.get("/v1/fii-reports/runs", async (req, res) => {
    const limitValue = typeof req.query.limit === "string" ? Number.parseInt(req.query.limit, 10) : 20;
    const limit = Number.isFinite(limitValue) ? Math.max(1, Math.min(limitValue, 100)) : 20;

    try {
      return res.json(await client.listRuns(limit));
    } catch (error) {
      return res.status(statusFromProxyError(error)).json(proxyErrorPayload("FII_REPORTS_RUNS_FAILED", error));
    }
  });

  app.get("/v1/fii-reports/runs/:kind/:runId", async (req, res) => {
    const kind = req.params.kind;
    if (kind !== "daily" && kind !== "backfill") {
      return res.status(400).json({
        error: {
          code: "FII_REPORTS_RUN_DETAIL_INVALID_KIND",
          message: "Run kind must be 'daily' or 'backfill'."
        }
      });
    }

    try {
      return res.json(await client.getRunDetail(kind, req.params.runId));
    } catch (error) {
      return res.status(statusFromProxyError(error)).json(proxyErrorPayload("FII_REPORTS_RUN_DETAIL_FAILED", error));
    }
  });

  app.post("/v1/fii-reports/latest", async (req, res) => {
    const parsed = latestRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: {
          code: "FII_REPORTS_LATEST_INVALID_REQUEST",
          message: parsed.error.issues.map((issue) => issue.message).join("; ")
        }
      });
    }

    try {
      return res.json(await client.pullLatest(parsed.data as FiiReportsLatestPullRequest));
    } catch (error) {
      return res.status(statusFromProxyError(error)).json(proxyErrorPayload("FII_REPORTS_LATEST_FAILED", error));
    }
  });

  app.post("/v1/fii-reports/backfill", async (req, res) => {
    const parsed = backfillRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: {
          code: "FII_REPORTS_BACKFILL_INVALID_REQUEST",
          message: parsed.error.issues.map((issue) => issue.message).join("; ")
        }
      });
    }

    try {
      return res.json(await client.backfill(parsed.data as FiiReportsBackfillRequest));
    } catch (error) {
      return res.status(statusFromProxyError(error)).json(proxyErrorPayload("FII_REPORTS_BACKFILL_FAILED", error));
    }
  });

  app.post("/v1/fii-reports/load", async (req, res) => {
    const parsed = loadRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: {
          code: "FII_REPORTS_LOAD_INVALID_REQUEST",
          message: parsed.error.issues.map((issue) => issue.message).join("; ")
        }
      });
    }

    try {
      return res.json(await client.load(parsed.data as FiiReportsLoadRequest));
    } catch (error) {
      return res.status(statusFromProxyError(error)).json(proxyErrorPayload("FII_REPORTS_LOAD_FAILED", error));
    }
  });
}
