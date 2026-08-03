import type { Express } from "express";
import { z } from "zod";
import {
  createDisclosuresClient,
  type DisclosuresClient,
  type DisclosuresLoadRequest,
  type DisclosuresRunRequest
} from "../lib/disclosuresClient";

const runRequestSchema = z
  .object({
    symbols: z.array(z.string().trim().min(1)).optional(),
    nse_fin_start_date: z.string().trim().min(1).optional(),
    nse_fin_end_date: z.string().trim().min(1).optional(),
    corp_actions_start_date: z.string().trim().min(1).optional(),
    corp_actions_end_date: z.string().trim().min(1).optional(),
    event_start_date: z.string().trim().min(1).optional(),
    event_end_date: z.string().trim().min(1).optional(),
    load_postgres: z.boolean().optional(),
    truncate_tables_on_load: z.boolean().optional()
  })
  .strict();

const loadRequestSchema = z
  .object({
    run_id: z.string().trim().min(1).optional(),
    truncate_tables_on_load: z.boolean().optional()
  })
  .strict();

function statusFromProxyError(error: unknown) {
  if (!(error instanceof Error)) return 502;
  const statusMatch = error.message.match(/Disclosures service (\d{3})/);
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
      message: error instanceof Error ? error.message : "Disclosures service request failed."
    }
  };
}

export function registerDisclosures(
  app: Express,
  client: DisclosuresClient = createDisclosuresClient()
) {
  app.get("/v1/disclosures/health", async (_req, res) => {
    try {
      return res.json(await client.getHealth());
    } catch (error) {
      return res.status(statusFromProxyError(error)).json(proxyErrorPayload("DISCLOSURES_HEALTH_FAILED", error));
    }
  });

  app.get("/v1/disclosures/latest-run", async (_req, res) => {
    try {
      return res.json(await client.getLatestRun());
    } catch (error) {
      return res.status(statusFromProxyError(error)).json(proxyErrorPayload("DISCLOSURES_LATEST_RUN_FAILED", error));
    }
  });

  app.post("/v1/disclosures/run", async (req, res) => {
    const parsed = runRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: {
          code: "DISCLOSURES_RUN_INVALID_REQUEST",
          message: parsed.error.issues.map((issue) => issue.message).join("; ")
        }
      });
    }

    try {
      return res.json(await client.runPipeline(parsed.data as DisclosuresRunRequest));
    } catch (error) {
      return res.status(statusFromProxyError(error)).json(proxyErrorPayload("DISCLOSURES_RUN_FAILED", error));
    }
  });

  app.post("/v1/disclosures/load", async (req, res) => {
    const parsed = loadRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: {
          code: "DISCLOSURES_LOAD_INVALID_REQUEST",
          message: parsed.error.issues.map((issue) => issue.message).join("; ")
        }
      });
    }

    try {
      return res.json(await client.loadRun(parsed.data as DisclosuresLoadRequest));
    } catch (error) {
      return res.status(statusFromProxyError(error)).json(proxyErrorPayload("DISCLOSURES_LOAD_FAILED", error));
    }
  });
}
