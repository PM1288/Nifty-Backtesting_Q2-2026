import { createHash, randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import path from "node:path";
import type { Express, Request } from "express";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { RequestAuthenticator } from "../auth/guard";

const strategyCatalogue = {
  rsi30_willr80_closegtprev_tp125_v1: {
    displayName: "Fast Oversold Rebound",
    strategyId: "rsi30_willr80_closegtprev_tp125",
    entryKind: "fast_oversold_rebound",
    plainEnglish: "Signal when daily RSI and Williams %R are below the selected limits and the close is above the previous close; enter at the next session open.",
    authoritativeExit: "The strategy target configured for this version. Diagnostic ladders never close the execution replay.",
    parameters: {
      rsiMax: { type: "number", minimum: 5, maximum: 60, step: 1, default: 30, label: "RSI below" },
      willrMax: { type: "number", minimum: -100, maximum: -20, step: 5, default: -80, label: "Williams %R below" },
      requireCloseAbovePrevious: { type: "boolean", default: true, label: "Close above previous close" },
      takeProfitPct: { type: "number", minimum: 0.1, maximum: 15, step: 0.05, default: 1.25, label: "Execution target %" }
    }
  },
  rsi_reclaim30_willr_reclaim80_greenclose_tp200_sl200_max10_v1: {
    displayName: "Confirmed Oversold Recovery",
    strategyId: "rsi_reclaim30_willr_reclaim80_greenclose_tp200_sl200_max10",
    entryKind: "confirmed_oversold_recovery",
    plainEnglish: "Signal when RSI and Williams %R reclaim selected levels with the configured candle confirmations; enter at the next session open.",
    authoritativeExit: "Configured target, stop and timeout remain execution rules. Independent ladders are diagnostics.",
    parameters: {
      rsiReclaimLevel: { type: "number", minimum: 10, maximum: 60, step: 1, default: 30, label: "RSI reclaim" },
      willrReclaimLevel: { type: "number", minimum: -100, maximum: -20, step: 5, default: -80, label: "Williams %R reclaim" },
      requireGreenClose: { type: "boolean", default: true, label: "Require green candle" },
      requireCloseAbovePrevious: { type: "boolean", default: true, label: "Close above previous close" },
      takeProfitPct: { type: "number", minimum: 0.1, maximum: 15, step: 0.05, default: 2, label: "Execution target %" },
      stopLossPct: { type: "number", minimum: 0.1, maximum: 15, step: 0.05, default: 2, label: "Execution stop %" },
      maxHoldDays: { type: "integer", minimum: 1, maximum: 60, step: 1, default: 10, label: "Maximum hold sessions" }
    }
  },
  macd_bullcross_above50dma_rsi55to70_tp400_sl300_max20_v1: {
    displayName: "MACD Trend Continuation",
    strategyId: "macd_bullcross_above50dma_rsi55to70_tp400_sl300_max20",
    entryKind: "macd_trend_continuation",
    plainEnglish: "Signal on a bullish MACD cross above the 50-day trend filter while RSI remains inside the selected band; enter at the next session open.",
    authoritativeExit: "Configured target, stop, trend failure and timeout remain execution rules. Independent ladders are diagnostics.",
    parameters: {
      rsiMin: { type: "number", minimum: 20, maximum: 80, step: 1, default: 55, label: "RSI minimum" },
      rsiMax: { type: "number", minimum: 20, maximum: 90, step: 1, default: 70, label: "RSI maximum" },
      takeProfitPct: { type: "number", minimum: 0.1, maximum: 20, step: 0.1, default: 4, label: "Execution target %" },
      stopLossPct: { type: "number", minimum: 0.1, maximum: 20, step: 0.1, default: 3, label: "Execution stop %" },
      maxHoldDays: { type: "integer", minimum: 1, maximum: 120, step: 1, default: 20, label: "Maximum hold sessions" }
    }
  }
} as const;

type StrategyVersionId = keyof typeof strategyCatalogue;
type ParameterSpec = { type: string; minimum?: number; maximum?: number; default: number | boolean };

const createRunSchema = z.object({
  schemaVersion: z.literal("1.0"),
  strategyVersionId: z.string().min(1).max(160),
  sourceBatchRunId: z.number().int().positive().optional(),
  dateStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  universe: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("single_stock"), symbols: z.array(z.string().regex(/^[A-Z0-9&-]{1,32}$/)).length(1) }).strict(),
    z.object({ mode: z.literal("nifty_100"), symbols: z.array(z.never()).max(0).default([]) }).strict()
  ]),
  parameters: z.record(z.union([z.number().finite(), z.boolean()])),
  capital: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("no_capital_limit"), startingCapital: z.null(), ticketSize: z.null(), maxPositions: z.null() }).strict(),
    z.object({ mode: z.literal("capital_16l"), startingCapital: z.literal(1_600_000), ticketSize: z.literal(200_000), maxPositions: z.literal(8) }).strict(),
    z.object({ mode: z.literal("capital_10l"), startingCapital: z.literal(1_000_000), ticketSize: z.literal(100_000), maxPositions: z.literal(10) }).strict()
  ])
}).strict();

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashRequest(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

function jsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_key, item) => typeof item === "bigint" ? Number(item) : item)) as T;
}

function actor(req: Request): string {
  return req.authUser?.email || req.authUser?.uid || "n50-lab";
}

function validateParameters(strategyVersionId: StrategyVersionId, parameters: Record<string, number | boolean>) {
  const specs = strategyCatalogue[strategyVersionId].parameters as Record<string, ParameterSpec>;
  const unknown = Object.keys(parameters).filter((key) => !(key in specs));
  if (unknown.length) throw new Error(`Unknown parameters: ${unknown.join(", ")}`);
  const normalized: Record<string, number | boolean> = {};
  for (const [name, spec] of Object.entries(specs)) {
    const value = parameters[name] ?? spec.default;
    if (spec.type === "boolean") {
      if (typeof value !== "boolean") throw new Error(`${name} must be boolean.`);
      normalized[name] = value;
      continue;
    }
    if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${name} must be numeric.`);
    if (spec.minimum != null && value < spec.minimum || spec.maximum != null && value > spec.maximum) {
      throw new Error(`${name} is outside the allowed range.`);
    }
    if (spec.type === "integer" && !Number.isInteger(value)) throw new Error(`${name} must be an integer.`);
    normalized[name] = value;
  }
  if (typeof normalized.rsiMin === "number" && typeof normalized.rsiMax === "number" && normalized.rsiMin > normalized.rsiMax) {
    throw new Error("rsiMin must not exceed rsiMax.");
  }
  return normalized;
}

async function requireMutationAuth(req: Request, auth: RequestAuthenticator) {
  if (!auth.requireAuth) return;
  const session = await auth.getSession(req);
  if (!session) throw Object.assign(new Error("Active session required."), { status: 401, code: "AUTH_REQUIRED" });
  auth.requireCsrf(req, session);
}

function integerQuery(value: unknown, fallback: number, maximum: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

export function registerBacktestingLab(app: Express, prisma: PrismaClient, auth: RequestAuthenticator) {
  app.get("/v1/backtesting/lab/catalogue", async (_req, res) => {
    const batches = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
      SELECT b.batch_run_id::int AS "batchRunId",b.data_as_of_date AS "dataAsOfDate",b.generated_at AS "generatedAt",
             min(f.trade_date) AS "dateStart",max(f.trade_date) AS "dateEnd",count(DISTINCT f.symbol)::int AS "symbolCount"
        FROM nse_app.batch_run_audit b JOIN nse_app.backtest_feature_daily f USING(batch_run_id)
       WHERE b.batch_name='backtesting_precompute' AND b.status='published' AND b.validation_status='passed'
       GROUP BY b.batch_run_id,b.data_as_of_date,b.generated_at ORDER BY b.batch_run_id DESC LIMIT 10`);
    res.setHeader("Cache-Control", "private, max-age=60");
    return res.json({
      environment: "RESEARCH_ONLY",
      engineVersion: "daily_strategy_lab_v1",
      evaluationPolicyVersion: "full_path_ladder_plus_h30_daily_v1",
      strategies: Object.entries(strategyCatalogue).map(([strategyVersionId, value]) => ({ strategyVersionId, ...value })),
      sourceBatches: batches,
      limits: { maximumCalendarDays: 1098, maximumSymbols: 100 },
      ladders: { intradayPct: [0.3, 0.5, 0.7], d5Pct: [1, 2, 5], adversePct: [-0.5, -1, -2, -5, -10, "BELOW_-10"], h30Pct: [1, 2, 5] }
    });
  });

  app.post("/v1/backtesting/lab/runs", async (req, res, next) => {
    try {
      await requireMutationAuth(req, auth);
      const idempotencyKey = String(req.header("Idempotency-Key") || "").trim();
      if (idempotencyKey.length < 8 || idempotencyKey.length > 128) {
        return res.status(400).json({ error: { code: "IDEMPOTENCY_KEY_REQUIRED", message: "Idempotency-Key must contain 8-128 characters." } });
      }
      const parsed = createRunSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: { code: "INVALID_LAB_REQUEST", message: parsed.error.issues[0]?.message, issues: parsed.error.issues } });
      const request = parsed.data;
      if (!(request.strategyVersionId in strategyCatalogue)) return res.status(400).json({ error: { code: "STRATEGY_NOT_ENABLED", message: "Strategy version is not enabled for the testing workspace." } });
      const start = new Date(`${request.dateStart}T00:00:00Z`);
      const end = new Date(`${request.dateEnd}T00:00:00Z`);
      const dayCount = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
      if (dayCount < 1 || dayCount > 1098) return res.status(400).json({ error: { code: "DATE_RANGE_OUT_OF_BOUNDS", message: "Date range must be between 1 and 1,098 calendar days." } });
      let parameters: Record<string, number | boolean>;
      try {
        parameters = validateParameters(request.strategyVersionId as StrategyVersionId, request.parameters);
      } catch (error) {
        return res.status(400).json({ error: { code: "PARAMETER_OUT_OF_BOUNDS", message: error instanceof Error ? error.message : String(error) } });
      }
      const batchRows = await prisma.$queryRawUnsafe<Array<{ batchRunId: bigint; dateStart: Date; dateEnd: Date }>>(`
        SELECT b.batch_run_id AS "batchRunId",min(f.trade_date) AS "dateStart",max(f.trade_date) AS "dateEnd"
          FROM nse_app.batch_run_audit b JOIN nse_app.backtest_feature_daily f USING(batch_run_id)
         WHERE b.batch_name='backtesting_precompute' AND b.status='published' AND b.validation_status='passed'
           AND ($1::bigint IS NULL OR b.batch_run_id=$1::bigint)
         GROUP BY b.batch_run_id ORDER BY b.batch_run_id DESC LIMIT 1`, request.sourceBatchRunId ?? null);
      const source = batchRows[0];
      if (!source) return res.status(409).json({ error: { code: "SOURCE_BATCH_UNAVAILABLE", message: "No validated published source batch is available." } });
      const normalizedRequest = { ...request, sourceBatchRunId: Number(source.batchRunId), parameters };
      const requestHash = hashRequest(normalizedRequest);
      const requestedBy = actor(req);
      const existing = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT * FROM research.strategy_lab_run WHERE requested_by=$1 AND idempotency_key=$2 LIMIT 1`, requestedBy, idempotencyKey
      );
      if (existing[0]) {
        if (existing[0].request_hash !== requestHash) return res.status(409).json({ error: { code: "IDEMPOTENCY_CONFLICT", message: "Idempotency key was already used for a different request." } });
        return res.status(200).json(jsonSafe(existing[0]));
      }
      const runId = randomUUID();
      const created = await prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRawUnsafe<Array<Record<string, unknown>>>(`
          INSERT INTO research.strategy_lab_run(
            run_id,idempotency_key,request_hash,requested_by,strategy_version_id,source_batch_run_id,
            engine_version,evaluation_policy_version,requested_date_start,requested_date_end,
            universe_mode,symbols,parameters,capital_config,total_work_units)
          VALUES ($1,$2,$3,$4,$5,$6,'daily_strategy_lab_v1','full_path_ladder_plus_h30_daily_v1',$7::date,$8::date,$9,$10::jsonb,$11::jsonb,$12::jsonb,$13)
          RETURNING *`, runId,idempotencyKey,requestHash,requestedBy,request.strategyVersionId,Number(source.batchRunId),
          request.dateStart,request.dateEnd,request.universe.mode,JSON.stringify(request.universe.symbols),JSON.stringify(parameters),JSON.stringify(request.capital),
          request.universe.mode === "single_stock" ? 1 : 100);
        await tx.$executeRawUnsafe(
          `INSERT INTO research.strategy_lab_event(run_id,event_type,status_after,event_payload,actor) VALUES ($1,'RUN_QUEUED','QUEUED',$2::jsonb,$3)`,
          runId,JSON.stringify({ requestHash, sourceBatchRunId: Number(source.batchRunId) }),requestedBy
        );
        return rows[0];
      });
      return res.status(202).json(jsonSafe(created));
    } catch (error) { return next(error); }
  });

  app.get("/v1/backtesting/lab/runs", async (req, res) => {
    const limit = integerQuery(req.query.limit, 25, 100);
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
      SELECT run_id AS "runId",strategy_version_id AS "strategyVersionId",source_batch_run_id::int AS "sourceBatchRunId",
             requested_date_start AS "requestedDateStart",requested_date_end AS "requestedDateEnd",
             actual_date_start AS "actualDateStart",actual_date_end AS "actualDateEnd",universe_mode AS "universeMode",
             symbols,parameters,capital_config AS "capital",status,validation_status AS "validationStatus",
             total_work_units AS "totalWorkUnits",completed_work_units AS "completedWorkUnits",heartbeat_at AS "heartbeatAt",
             summary,result_hash AS "resultHash",error_code AS "errorCode",created_at AS "createdAt",started_at AS "startedAt",finished_at AS "finishedAt"
        FROM research.strategy_lab_run ORDER BY created_at DESC LIMIT $1`, limit);
    return res.json({ items: rows });
  });

  app.get("/v1/backtesting/lab/runs/:runId", async (req, res) => {
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
      SELECT run.run_id AS "runId",run.strategy_version_id AS "strategyVersionId",
      run.source_batch_run_id::int AS "sourceBatchRunId",run.requested_date_start AS "requestedDateStart",
      run.requested_date_end AS "requestedDateEnd",run.actual_date_start AS "actualDateStart",
      run.actual_date_end AS "actualDateEnd",run.universe_mode AS "universeMode",
      run.symbols,run.parameters,run.capital_config AS "capital",run.status,
      run.validation_status AS "validationStatus",
      run.total_work_units AS "totalWorkUnits",run.completed_work_units AS "completedWorkUnits",
      run.heartbeat_at AS "heartbeatAt",run.summary,run.validation_result AS "validationResult",
      run.result_hash AS "resultHash",run.error_code AS "errorCode",
      run.created_at AS "createdAt",run.started_at AS "startedAt",
      run.finished_at AS "finishedAt",coalesce((SELECT jsonb_agg(to_jsonb(event) ORDER BY event.event_id) FROM (
        SELECT event_id,event_type,status_before,status_after,event_payload,created_at
          FROM research.strategy_lab_event WHERE run_id=$1 ORDER BY event_id DESC LIMIT 100
      ) event),'[]'::jsonb) events,
      coalesce((SELECT jsonb_agg(to_jsonb(artifact)) FROM research.strategy_lab_artifact artifact WHERE artifact.run_id=run.run_id),'[]'::jsonb) artifacts
      FROM research.strategy_lab_run run WHERE run.run_id=$1 LIMIT 1`, req.params.runId);
    if (!rows[0]) return res.status(404).json({ error: { code: "LAB_RUN_NOT_FOUND", message: "Run not found." } });
    return res.json(jsonSafe(rows[0]));
  });

  app.get("/v1/backtesting/lab/runs/:runId/trades", async (req, res) => {
    const limit = integerQuery(req.query.limit, 100, 500);
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
      SELECT * FROM simulation.strategy_lab_trade WHERE run_id=$1 ORDER BY entry_date,symbol LIMIT $2 OFFSET $3`, req.params.runId,limit,offset);
    return res.json({ items: rows, limit, offset });
  });

  app.get("/v1/backtesting/lab/runs/:runId/trades.csv", async (req, res) => {
    const runId = z.string().uuid().safeParse(req.params.runId);
    if (!runId.success) return res.status(400).json({ error: { code: "INVALID_RUN_ID", message: "Run ID must be a UUID." } });
    const rootSetting = process.env.STRATEGY_LAB_ARTIFACT_ROOT?.trim();
    if (!rootSetting) return res.status(503).json({ error: { code: "LAB_ARTIFACTS_UNAVAILABLE", message: "Strategy-lab artifact storage is not mounted." } });
    const rows = await prisma.$queryRawUnsafe<Array<{ relativePath: string }>>(
      `SELECT relative_path AS "relativePath" FROM research.strategy_lab_artifact WHERE run_id=$1 AND artifact_kind='TRADES_CSV' LIMIT 1`,
      runId.data
    );
    if (!rows[0]) return res.status(404).json({ error: { code: "LAB_ARTIFACT_NOT_FOUND", message: "Consolidated trade CSV is not available for this run." } });
    const root = path.resolve(rootSetting);
    const candidate = path.resolve(root, rows[0].relativePath);
    if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) {
      return res.status(500).json({ error: { code: "LAB_ARTIFACT_PATH_INVALID", message: "Stored artifact path failed validation." } });
    }
    try {
      const details = await stat(candidate);
      if (!details.isFile()) throw new Error("not a file");
    } catch {
      return res.status(404).json({ error: { code: "LAB_ARTIFACT_FILE_MISSING", message: "The artifact record exists but its file is unavailable." } });
    }
    res.setHeader("Cache-Control", "private, no-store");
    return res.download(candidate, `strategy-lab-${runId.data}-trades.csv`);
  });

  app.get("/v1/backtesting/lab/runs/:runId/ladders", async (req, res) => {
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
      SELECT ladder_kind AS "ladderKind",level_key AS "levelKey",level_pct::double precision AS "levelPct",
             count(*)::int AS "sampleCount",count(*) FILTER (WHERE hit)::int AS "hitCount",
             round(100.0*count(*) FILTER (WHERE hit)/nullif(count(*),0),2)::double precision AS "hitRatePct"
        FROM simulation.strategy_lab_ladder_result WHERE run_id=$1
       GROUP BY ladder_kind,level_key,level_pct ORDER BY ladder_kind,level_pct`, req.params.runId);
    return res.json({ items: rows });
  });

  app.get("/v1/backtesting/lab/runs/:runId/equity", async (req, res) => {
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
      SELECT trade_date AS "tradeDate",cash::double precision,deployed_capital::double precision AS "deployedCapital",
             net_liquidation_equity::double precision AS "netLiquidationEquity",realised_pnl::double precision AS "realisedPnl",
             unrealised_pnl::double precision AS "unrealisedPnl",drawdown_pct::double precision AS "drawdownPct",open_positions AS "openPositions"
        FROM simulation.strategy_lab_equity_point WHERE run_id=$1 ORDER BY trade_date`, req.params.runId);
    return res.json({ items: rows });
  });

  app.post("/v1/backtesting/lab/runs/:runId/cancel", async (req, res, next) => {
    try {
      await requireMutationAuth(req, auth);
      const updated = await prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRawUnsafe<Array<Record<string, unknown>>>(`
          UPDATE research.strategy_lab_run SET status=CASE WHEN status='QUEUED' THEN 'CANCELLED' ELSE 'CANCEL_REQUESTED' END,
                 finished_at=CASE WHEN status='QUEUED' THEN now() ELSE finished_at END,updated_at=now()
           WHERE run_id=$1 AND status IN ('QUEUED','RUNNING') RETURNING *`, req.params.runId);
        if (!rows[0]) return null;
        await tx.$executeRawUnsafe(
          `INSERT INTO research.strategy_lab_event(run_id,event_type,status_after,actor) VALUES ($1,'CANCEL_REQUESTED',$2,$3)`,
          req.params.runId,rows[0].status,actor(req)
        );
        return rows[0];
      });
      if (!updated) return res.status(409).json({ error: { code: "RUN_NOT_CANCELLABLE", message: "Run is not queued or running." } });
      return res.json(jsonSafe(updated));
    } catch (error) { return next(error); }
  });
}

export const backtestingLabTestExports = { canonical, hashRequest, validateParameters, createRunSchema };
