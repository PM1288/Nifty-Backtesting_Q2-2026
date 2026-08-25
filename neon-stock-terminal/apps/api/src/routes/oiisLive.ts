import type { Express, Request } from "express";
import type { PrismaClient } from "@prisma/client";

const SYMBOL = /^[A-Z0-9&-]{1,32}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TRADE_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function currentIstTradeDate(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function text(value: unknown, maximum = 500) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function boolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function thresholds(body: Record<string, unknown> | undefined) {
  const rsi = Number(body?.rsiMax ?? 30);
  const willr = Number(body?.willrMax ?? -80);
  if (
    !Number.isFinite(rsi) ||
    rsi <= 0 ||
    rsi > 100 ||
    !Number.isFinite(willr) ||
    willr < -100 ||
    willr >= 0
  )
    return null;
  return { rsi, willr };
}

function actor(req: Request) {
  return (
    text((req as Request & { user?: { email?: string } }).user?.email, 120) ||
    "n50-ui"
  );
}

export function registerOiisLivePublic(app: Express, prisma: PrismaClient) {
  app.get("/v1/oiis-live/dashboard", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const requestedDate = text(req.query.tradeDate, 10);
    if (requestedDate && !TRADE_DATE.test(requestedDate)) {
      return res.status(400).json({ error: "tradeDate must use YYYY-MM-DD." });
    }
    const tradeDate = requestedDate || currentIstTradeDate();
    const dates = await prisma.$queryRawUnsafe<Array<{ trade_date: Date }>>(
      `SELECT trade_date FROM (
         SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date AS trade_date
         UNION
         SELECT DISTINCT trade_date FROM oiis_live.selection_run
         WHERE status='COMPLETED' AND requested_universe='ALL_FNO'
       ) available_dates
       ORDER BY trade_date DESC LIMIT 10`,
    );
    const latestRunRows = await prisma.$queryRawUnsafe<
      Array<Record<string, any>>
    >(
      `SELECT * FROM oiis_live.selection_run
       WHERE status='COMPLETED' AND requested_universe='ALL_FNO'
         AND ($1::date IS NULL OR trade_date=$1::date)
       ORDER BY decision_as_of DESC NULLS LAST,
         string_to_array(policy_version,'.')::int[] DESC,completed_at DESC NULLS LAST,started_at DESC
       LIMIT 1`,
      tradeDate,
    );
    const latestRun = latestRunRows[0] ?? null;
    const latestRunId = latestRun?.run_id ?? null;
    const [
      watchlist,
      entries,
      runs,
      diagnostics,
      errors,
      paper,
      freshness,
      queues,
      funnel,
      rejectionReasons,
      nearMisses,
      historical,
      recommendations,
      failureBuckets,
      gateBreakdown,
      universe,
    ] = await Promise.all([
      prisma.$queryRawUnsafe(
        `SELECT * FROM oiis_live.v_current_watchlist WHERE active AND ($1::date IS NULL OR trade_date=$1::date) ORDER BY rank NULLS LAST,symbol`,
        tradeDate,
      ),
      prisma.$queryRawUnsafe(
        `SELECT * FROM oiis_live.entry_claim WHERE ($1::date IS NULL OR trade_date=$1::date) ORDER BY signal_ts DESC`,
        tradeDate,
      ),
      prisma.$queryRawUnsafe(
        `SELECT * FROM oiis_live.selection_run
         WHERE ($1::date IS NULL OR trade_date=$1::date)
         ORDER BY decision_as_of DESC NULLS LAST,completed_at DESC NULLS LAST LIMIT 20`,
        tradeDate,
      ),
      prisma.$queryRawUnsafe(
        `SELECT * FROM oiis_live.v_service_diagnostics ORDER BY service_name`,
      ),
      prisma.$queryRawUnsafe(
        `SELECT severity,status,count(*)::int count,max(created_at) latest FROM oiis_live.error_outbox GROUP BY severity,status ORDER BY severity,status`,
      ),
      prisma.$queryRawUnsafe(
        `SELECT status,count(*)::int count FROM paper_trading.trade_groups GROUP BY status ORDER BY status`,
      ),
      prisma.$queryRawUnsafe(`SELECT
        (SELECT max(ts) FROM public.bars_1m) latest_minute_bar,
        (SELECT max(trade_date) FROM nse.fact_eod_prices) latest_nse_eod,
        (SELECT max(trade_date) FROM strategy_eval.stock_daily_regime) latest_stock_regime,
        (SELECT count(DISTINCT symbol_token)::int FROM public.bars_1m WHERE ts=(SELECT max(ts) FROM public.bars_1m)) latest_minute_symbols`),
      prisma.$queryRawUnsafe(`SELECT
        (SELECT count(*)::int FROM paper_trading.webhook_outbox WHERE status IN ('PENDING','RETRY','PROCESSING')) paper_outbox_pending,
        (SELECT count(*)::int FROM paper_trading.webhook_dead_letters) paper_dead_letters,
        (SELECT count(*)::int FROM oiis_live.error_outbox WHERE status='PENDING') oiis_errors_pending,
        (SELECT count(*)::int FROM oiis_live.entry_claim WHERE status='FAILED_RETRYABLE') entry_retries_pending`),
      prisma.$queryRawUnsafe(
        `SELECT
        count(*)::int evaluated,
        count(*) FILTER (WHERE data_permission='FULL')::int data_permitted,
        count(*) FILTER (WHERE data_quality>=85)::int quality_pass,
        count(*) FILTER (WHERE ofactor>=54)::int ofactor_screened,
        count(*) FILTER (WHERE ofactor>=74)::int ofactor_pass,
        count(*) FILTER (WHERE ofactor_level='LOW')::int ofactor_low,
        count(*) FILTER (WHERE ofactor_level='MEDIUM')::int ofactor_medium,
        count(*) FILTER (WHERE ofactor_level='HIGH')::int ofactor_high,
        count(*) FILTER (WHERE xfactor_snapshot>=76)::int xfactor_pass,
        count(*) FILTER (WHERE blocking_gate_count=0)::int hard_gate_clear,
        count(*) FILTER (WHERE daily_level='HIGH')::int high_count,
        count(*) FILTER (WHERE daily_level='MEDIUM')::int medium_count,
        count(*) FILTER (WHERE daily_level='LOW')::int low_count,
        count(*) FILTER (WHERE selected)::int selected
       FROM oiis_live.daily_candidate
       WHERE run_id=$1::uuid`,
        latestRunId,
      ),
      prisma.$queryRawUnsafe(
        `SELECT reason, count(*)::int count
       FROM oiis_live.daily_candidate candidate
       CROSS JOIN LATERAL jsonb_array_elements_text(candidate.reason_codes) reason
       WHERE candidate.run_id=$1::uuid
       GROUP BY reason ORDER BY count(*) DESC, reason LIMIT 8`,
        latestRunId,
      ),
      prisma.$queryRawUnsafe(
        `SELECT candidate_id,symbol,sector,daily_level,canonical_status,
        ofactor,xfactor_snapshot,data_quality,data_permission,directional_edge,rsi14,willr14,
        structural_direction,session_direction,direction_state,session_direction_score,
        opportunity_rank,execution_rank,data_coverage,setup_id,setup_state,
        reference_price,buy_limit,no_chase_price,reason_codes,condition_results,
        round((
          LEAST(COALESCE(ofactor,0)/74,1)*35 +
          LEAST(COALESCE(xfactor_snapshot,0)/76,1)*30 +
          LEAST(COALESCE(data_quality,0)/85,1)*15 +
          CASE WHEN data_permission='FULL' THEN 10 ELSE 0 END +
          CASE WHEN blocking_gate_count=0 THEN 10 ELSE 0 END
        )::numeric,2) readiness_score
       FROM oiis_live.daily_candidate
       WHERE run_id=$1::uuid AND NOT selected
       ORDER BY readiness_score DESC,ofactor DESC NULLS LAST,xfactor_snapshot DESC NULLS LAST,symbol
       LIMIT 15`,
        latestRunId,
      ),
      prisma.$queryRawUnsafe(`SELECT historical_run_id,start_date,end_date,status,candidate_count,
        qualified_candidate_count,triggered_trade_count,summary,completed_at
       FROM oiis_live.historical_run WHERE status='COMPLETED'
       ORDER BY completed_at DESC NULLS LAST,created_at DESC LIMIT 1`),
      prisma.$queryRawUnsafe(
        `SELECT candidate_id,symbol,sector,direction,ofactor,ofactor_level,
        xfactor_snapshot,directional_edge,directional_edge_level,extension_level,volume_level,
        failed_gate_count,blocking_gate_count,recommendation_rank,opportunity_rank,execution_rank,
        structural_direction,session_direction,direction_state,session_direction_score,
        data_quality,data_permission,data_coverage,setup_id,setup_state,selected,reason_codes,
        feature_values,gate_evidence,universe_flags
       FROM oiis_live.daily_candidate
       WHERE run_id=$1::uuid AND recommended
       ORDER BY opportunity_rank NULLS LAST,recommendation_rank NULLS LAST`,
        latestRunId,
      ),
      prisma.$queryRawUnsafe(
        `SELECT failed_gate_count,count(*)::int count
       FROM oiis_live.daily_candidate
       WHERE run_id=$1::uuid
       GROUP BY failed_gate_count ORDER BY failed_gate_count`,
        latestRunId,
      ),
      prisma.$queryRawUnsafe(
        `SELECT reason,direction,count(*)::int count
       FROM oiis_live.daily_candidate candidate
       CROSS JOIN LATERAL jsonb_array_elements_text(candidate.reason_codes) reason
       WHERE candidate.run_id=$1::uuid
       GROUP BY reason,direction ORDER BY reason,direction`,
        latestRunId,
      ),
      prisma.$queryRawUnsafe(`SELECT count(*) FILTER (WHERE active)::int eligible,
        count(*) FILTER (WHERE is_fno)::int fno,
        count(*) FILTER (WHERE is_nifty50)::int nifty50,
        count(*) FILTER (WHERE is_fno AND is_nifty50)::int intersection,
        max(refreshed_at) refreshed_at FROM oiis_live.universe_member`),
    ]);
    res.json({
      environment: "PAPER",
      policyId: "OIIS_DAILY_SELECTION_INTRADAY_ENTRY_V1.0",
      policyVersion: latestRun?.policy_version ?? null,
      requestedUniverse: latestRun?.requested_universe ?? "ALL_FNO",
      latestRun,
      selectionScheduleIst: [
        "09:30",
        "10:00",
        "10:30",
        "11:00",
        "11:30",
        "12:00",
        "12:30",
        "13:00",
        "13:30",
        "14:00",
        "14:30",
        "15:00",
      ],
      scannerMode: "OIIS_LIVE_FULL_DIRECTIONAL",
      executionMode: "OIIS_DAILY_LONG_PULLBACK",
      autoPaperPolicy: {
        enabled: true,
        qualityFormula: "OFactor + XFactor + Data Quality",
        thresholdExclusive: 185,
        topCandidatesPerRun: 1,
        oneTradePerSymbolPerDay: true,
      },
      tradeDate,
      availableDates: dates,
      watchlist,
      entries,
      runs,
      diagnostics,
      errors,
      paper,
      freshness: (freshness as Array<unknown>)[0],
      queues: (queues as Array<unknown>)[0],
      funnel: (funnel as Array<unknown>)[0],
      rejectionReasons,
      nearMisses,
      recommendations,
      failureBuckets,
      gateBreakdown,
      universe: (universe as Array<unknown>)[0],
      historical: (historical as Array<unknown>)[0] ?? null,
    });
  });

  app.get("/v1/oiis-live/run-history", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const requestedDate = text(req.query.tradeDate, 10);
    const requestedLimit = Number(req.query.limit ?? 24);
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(100, Math.trunc(requestedLimit)))
      : 24;
    const runs = await prisma.$queryRawUnsafe<Array<Record<string, any>>>(
      `SELECT r.*,c.symbol AS auto_paper_symbol,c.direction AS auto_paper_direction,
        c.quality_score AS auto_paper_quality_score,e.entry_status,
        e.paper_trade_group_id,e.entry_error,e.entry_method_statuses
       FROM oiis_live.selection_run r
       LEFT JOIN oiis_live.daily_candidate c ON c.candidate_id=r.auto_paper_candidate_id
       LEFT JOIN LATERAL (
         SELECT (array_agg(ec.status ORDER BY ec.updated_at DESC))[1] AS entry_status,
           (array_agg(ec.paper_trade_group_id ORDER BY ec.updated_at DESC)
             FILTER (WHERE ec.paper_trade_group_id IS NOT NULL))[1] AS paper_trade_group_id,
           (array_agg(ec.last_error ORDER BY ec.updated_at DESC)
             FILTER (WHERE ec.last_error IS NOT NULL))[1] AS entry_error,
           jsonb_object_agg(ec.entry_method,ec.status ORDER BY ec.entry_method) AS entry_method_statuses
         FROM oiis_live.entry_claim ec WHERE ec.policy_id=r.policy_id
           AND ec.trade_date=r.trade_date AND ec.symbol=c.symbol
       ) e ON true
       WHERE r.status='COMPLETED' AND r.requested_universe='ALL_FNO'
         AND ($1::date IS NULL OR r.trade_date=$1::date)
       ORDER BY r.trade_date DESC,r.decision_as_of DESC NULLS LAST,r.completed_at DESC NULLS LAST
       LIMIT $2`,
      requestedDate || null,
      limit,
    );
    const ids = runs.map((run) => String(run.run_id));
    const changes = ids.length
      ? await prisma.$queryRawUnsafe<Array<Record<string, any>>>(
          `SELECT change.*,e.entry_status,e.paper_trade_group_id,e.entry_method_statuses
           FROM oiis_live.candidate_run_change change
           LEFT JOIN LATERAL (
             SELECT (array_agg(ec.status ORDER BY ec.updated_at DESC))[1] AS entry_status,
               (array_agg(ec.paper_trade_group_id ORDER BY ec.updated_at DESC)
                 FILTER (WHERE ec.paper_trade_group_id IS NOT NULL))[1] AS paper_trade_group_id,
               jsonb_object_agg(ec.entry_method,ec.status ORDER BY ec.entry_method) AS entry_method_statuses
             FROM oiis_live.entry_claim ec WHERE ec.policy_id=$2
               AND ec.trade_date=change.trade_date AND ec.symbol=change.symbol
           ) e ON true
           WHERE change.run_id=ANY($1::uuid[])
           ORDER BY change.run_id,change.auto_paper_selected DESC,
             abs(coalesce(change.quality_score_delta,0)) DESC,change.opportunity_rank NULLS LAST`,
          ids,
          "OIIS_DAILY_SELECTION_INTRADAY_ENTRY_V1.0",
        )
      : [];
    const byRun = new Map<string, Array<Record<string, any>>>();
    for (const change of changes) {
      const key = String(change.run_id);
      byRun.set(key, [...(byRun.get(key) ?? []), change]);
    }
    res.json({
      environment: "PAPER",
      scheduleIst: ["09:30","10:00","10:30","11:00","11:30","12:00","12:30","13:00","13:30","14:00","14:30","15:00"],
      timezone: "Asia/Kolkata",
      qualityFormula: "OFactor + XFactor + Data Quality",
      thresholdExclusive: 185,
      runs: runs.map((run) => ({ ...run, changes: byRun.get(String(run.run_id)) ?? [] })),
    });
  });

  app.get("/v1/oiis-live/candidates", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const requestedDate = text(req.query.tradeDate, 10);
    if (requestedDate && !TRADE_DATE.test(requestedDate)) {
      return res.status(400).json({ error: "tradeDate must use YYYY-MM-DD." });
    }
    const tradeDate = requestedDate || currentIstTradeDate();
    const search = text(req.query.search, 32).toUpperCase();
    const latestRunRows = await prisma.$queryRawUnsafe<
      Array<{ run_id: string; trade_date: Date }>
    >(
      `SELECT run_id,trade_date FROM oiis_live.selection_run
       WHERE status='COMPLETED' AND requested_universe='ALL_FNO'
         AND ($1::date IS NULL OR trade_date=$1::date)
       ORDER BY decision_as_of DESC NULLS LAST,
         string_to_array(policy_version,'.')::int[] DESC,completed_at DESC NULLS LAST,started_at DESC
       LIMIT 1`,
      tradeDate,
    );
    const latestRun = latestRunRows[0] ?? null;
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT candidate_id,run_id,signal_date,trade_date,symbol,sector,direction,
        daily_level,ofactor_level,directional_edge_level,extension_level,volume_level,
        canonical_status,selected,rank,recommended,recommendation_rank,data_quality,
        data_permission,ofactor,xfactor_snapshot,directional_edge,rsi14,willr14,ema61,
        macd_line,atr14,volume_vs_sma20,volume_percentile_90,reference_price,
        structural_direction,session_direction,direction_state,session_direction_score,
        opportunity_rank,execution_rank,data_coverage,setup_id,setup_state,
        failed_gate_count,blocking_gate_count,component_scores,market_context,
        condition_results,reason_codes,feature_values,gate_evidence,universe_flags,
        observed_at,available_at
       FROM oiis_live.daily_candidate
       WHERE run_id=$1::uuid
         AND ($2='' OR symbol ILIKE '%'||$2||'%' OR sector ILIKE '%'||$2||'%')
       ORDER BY opportunity_rank NULLS LAST,recommended DESC,recommendation_rank NULLS LAST,
         execution_rank NULLS LAST,symbol`,
      latestRun?.run_id ?? null,
      search,
    );
    res.json({
      environment: "PAPER",
      tradeDate,
      runId: latestRun?.run_id ?? null,
      count: rows.length,
      candidates: rows,
    });
  });

  app.get("/v1/oiis-live/candidates/:symbol/context", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const symbol = text(req.params.symbol, 32).toUpperCase();
    if (!SYMBOL.test(symbol)) {
      return res.status(400).json({ error: { code: "BAD_SYMBOL", message: "Invalid symbol." } });
    }

    const candidates = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT candidate_id,run_id,signal_date,trade_date,symbol,sector,direction,
        daily_level,ofactor_level,directional_edge_level,extension_level,volume_level,
        canonical_status,selected,rank,recommended,recommendation_rank,data_quality,
        data_permission,ofactor,xfactor_snapshot,directional_edge,rsi14,willr14,ema61,
        macd_line,atr14,volume_vs_sma20,volume_percentile_90,reference_price,
        structural_direction,session_direction,direction_state,session_direction_score,
        opportunity_rank,execution_rank,data_coverage,setup_id,setup_state,
        failed_gate_count,blocking_gate_count,component_scores,market_context,
        condition_results,reason_codes,feature_values,gate_evidence,universe_flags,
        observed_at,available_at
       FROM oiis_live.daily_candidate
       WHERE symbol=$1 AND run_id=(
         SELECT run_id FROM oiis_live.selection_run
         WHERE status='COMPLETED' AND requested_universe='ALL_FNO'
           AND trade_date=(now() AT TIME ZONE 'Asia/Kolkata')::date
         ORDER BY decision_as_of DESC NULLS LAST,
           string_to_array(policy_version,'.')::int[] DESC,completed_at DESC NULLS LAST,started_at DESC
         LIMIT 1
       )
       LIMIT 1`,
      symbol,
    );

    let optionRows: Array<Record<string, unknown>> = [];
    let fnoError: string | null = null;
    try {
      optionRows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `WITH latest AS (
           SELECT MAX(ts) AS ts FROM public.smartapi_option_chain_snapshots
           WHERE underlying=$1
         )
         SELECT ts,underlying,expiry,exchange,symbol_token,tradingsymbol,strike,"right",lotsize,
           spot_price,futures_price,bid,ask,midpoint,spread,spread_pct,
           volume::text AS volume,oi::text AS oi,oi_change_pct,
           total_buy_qty::text AS total_buy_qty,total_sell_qty::text AS total_sell_qty,
           depth_imbalance,broker_iv,broker_delta,broker_gamma,
           broker_theta,broker_vega,local_iv,local_delta,local_gamma,local_theta,local_vega,
           greek_validation_status,quote_age_seconds,source_quote_ts,session_phase,data_quality_status
         FROM public.smartapi_option_chain_snapshots
         WHERE underlying=$1 AND ts=(SELECT ts FROM latest)
         ORDER BY ABS(strike-COALESCE(spot_price,strike)),"right"
         LIMIT 48`,
        symbol,
      );
    } catch (error) {
      fnoError = error instanceof Error ? error.message : "SmartAPI F&O context unavailable.";
    }

    return res.json({
      environment: "PAPER",
      symbol,
      candidate: candidates[0] ?? null,
      smartapi: {
        available: optionRows.length > 0,
        source: "public.smartapi_option_chain_snapshots",
        depthSource: "SmartAPI aggregate buy/sell quantities and depth imbalance stored on each option snapshot",
        capturedAt: optionRows[0]?.ts ?? null,
        optionCount: optionRows.length,
        options: optionRows,
        depthByToken: [],
        error: fnoError,
      },
    });
  });
}

export function registerOiisLive(app: Express, prisma: PrismaClient) {
  app.post("/v1/oiis-live/watchlist", async (req, res) => {
    const symbol = text(req.body?.symbol, 32).toUpperCase();
    const tradeDate = text(req.body?.tradeDate, 10);
    const limits = thresholds(req.body);
    if (
      !SYMBOL.test(symbol) ||
      !TRADE_DATE.test(tradeDate) ||
      !limits
    )
      return res
        .status(400)
        .json({
          error:
            "Valid symbol, tradeDate, RSI and WILLR thresholds are required.",
        });
    if (tradeDate !== currentIstTradeDate()) {
      return res.status(409).json({
        error: {
          code: "OIIS_TRADE_DATE_CLOSED",
          message: "OIIS selected stocks are valid only for the current IST trade date.",
        },
      });
    }
    const row = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `INSERT INTO oiis_live.watchlist_item(policy_id,trade_date,symbol,instrument_token,source,active,entry_enabled,daily_level,canonical_status,rsi_max,willr_max,notes,created_by,updated_by)
       VALUES ('OIIS_DAILY_SELECTION_INTRADAY_ENTRY_V1.0',$1::date,$2,
         (SELECT symbol_token FROM public.instruments WHERE exchange='NSE' AND tradingsymbol IN ($2,$2||'-EQ') ORDER BY updated_at DESC LIMIT 1),
         'MANUAL',$3,$4,'LOW','MANUAL_MONITOR_ONLY',$5,$6,$7,$8,$8)
       ON CONFLICT(policy_id,trade_date,symbol) DO UPDATE SET active=excluded.active,entry_enabled=excluded.entry_enabled,
         rsi_max=excluded.rsi_max,willr_max=excluded.willr_max,notes=excluded.notes,updated_by=excluded.updated_by,
         revision=oiis_live.watchlist_item.revision+1,updated_at=now() RETURNING *`,
      tradeDate,
      symbol,
      boolean(req.body?.active, true),
      boolean(req.body?.entryEnabled, false),
      limits.rsi,
      limits.willr,
      text(req.body?.notes),
      actor(req),
    );
    res.status(201).json(row[0]);
  });

  app.patch("/v1/oiis-live/watchlist/:id", async (req, res) => {
    if (!UUID.test(req.params.id))
      return res.status(400).json({ error: "Invalid watchlist ID." });
    const limits = thresholds(req.body);
    if (!limits)
      return res
        .status(400)
        .json({ error: "RSI must be in (0,100] and WILLR in [-100,0)." });
    const row = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `UPDATE oiis_live.watchlist_item SET active=$2,entry_enabled=$3,rsi_max=$4,willr_max=$5,
       notes=$6,updated_by=$7,revision=revision+1,updated_at=now()
       WHERE watchlist_item_id=$1::uuid AND trade_date=$8::date RETURNING *`,
      req.params.id,
      boolean(req.body?.active, true),
      boolean(req.body?.entryEnabled, false),
      limits.rsi,
      limits.willr,
      text(req.body?.notes),
      actor(req),
      currentIstTradeDate(),
    );
    if (!row[0])
      return res.status(404).json({ error: "Watchlist item not found." });
    res.json(row[0]);
  });

  app.delete("/v1/oiis-live/watchlist/:id", async (req, res) => {
    if (!UUID.test(req.params.id))
      return res.status(400).json({ error: "Invalid watchlist ID." });
    const changed = await prisma.$executeRawUnsafe(
      `UPDATE oiis_live.watchlist_item SET active=false,entry_enabled=false,updated_by=$2,revision=revision+1,updated_at=now()
       WHERE watchlist_item_id=$1::uuid AND trade_date=$3::date`,
      req.params.id,
      actor(req),
      currentIstTradeDate(),
    );
    if (!changed)
      return res.status(404).json({ error: "Watchlist item not found." });
    res.status(204).end();
  });

  app.post("/v1/oiis-live/commands", async (req, res) => {
    const command = text(req.body?.command, 40).toUpperCase();
    if (
      ![
        "RUN_SELECTION",
        "REFRESH_MARKET_DATA",
        "RETRY_ENTRY",
        "RECONCILE",
      ].includes(command)
    )
      return res.status(400).json({ error: "Unsupported command." });
    const row = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `INSERT INTO oiis_live.command_queue(command_type,requested_by,payload) VALUES ($1,$2,$3::jsonb) RETURNING *`,
      command,
      actor(req),
      JSON.stringify(req.body?.payload ?? {}),
    );
    res.status(202).json(row[0]);
  });
}
