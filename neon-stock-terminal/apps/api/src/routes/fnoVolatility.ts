import type { Express } from "express";
import type { PrismaClient } from "@prisma/client";

type Row = Record<string, any>;

const POLICY = {
  dataQualityMinimum: 80,
  movementMinimum: 55,
  liveConfirmationMinimum: 60,
  valueEdgeMinimum: 65,
  contractQualityMinimum: 70,
  finalReadinessMinimum: 72,
  forecastImpliedMinimum: 1.15,
  expectedReturnMinimum: 0.05,
  probabilityProfitMinimum: 0.55,
  directionEntropyMinimum: 0.9,
  maximumSpread: 0.05
} as const;

function numberOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value: number, minimum = 0, maximum = 100) {
  return Math.max(minimum, Math.min(maximum, value));
}

function ratioScore(value: unknown, threshold: number) {
  const parsed = numberOrNull(value);
  return parsed == null ? null : clamp((parsed / threshold) * 72);
}

export function optionIntelligenceScores(row: Row, chain: Row | null = null) {
  const quoteAge = numberOrNull(chain?.quote_age_seconds ?? row.quote_age_seconds);
  const bidAskPairs = numberOrNull(chain?.two_sided_contracts) ?? 0;
  const contractCount = numberOrNull(chain?.contract_count) ?? 0;
  const identity = row.expiry && row.call_symbol && row.put_symbol ? 25 : contractCount >= 2 ? 20 : 0;
  const freshness = quoteAge == null ? 0 : quoteAge <= 3 ? 25 : quoteAge <= 7 ? 18 : quoteAge <= 120 ? 6 : 0;
  const completeness = bidAskPairs >= 2 || (numberOrNull(row.call_bid)! > 0 && numberOrNull(row.call_ask)! > 0 && numberOrNull(row.put_bid)! > 0 && numberOrNull(row.put_ask)! > 0) ? 15 : contractCount ? 6 : 0;
  const sequence = chain?.snapshot_ts || row.quote_source_as_of ? 15 : 0;
  const sane = (numberOrNull(row.combined_entry_ask) ?? numberOrNull(chain?.average_ask) ?? 0) > 0 &&
    (numberOrNull(row.combined_spread_pct) ?? numberOrNull(chain?.average_spread_pct) ?? 1) >= 0 ? 10 : 0;
  const service = row.run_status === "COMPLETED" || row.data_status === "FULL" ? 10 : chain?.snapshot_ts ? 7 : 0;
  const dataQualityScore = clamp(identity + freshness + completeness + sequence + sane + service);

  const spread = numberOrNull(row.combined_spread_pct) ?? numberOrNull(chain?.average_spread_pct);
  const spreadScore = spread == null ? null : spread <= 0.02 ? 100 : spread <= POLICY.maximumSpread ? 100 - ((spread - 0.02) / 0.03) * 40 : clamp(60 - (spread - 0.05) * 1000);
  const depthScore = contractCount > 0
    ? clamp(((bidAskPairs / contractCount) * 70) + (numberOrNull(chain?.depth_covered_contracts) ?? 0) / contractCount * 30)
    : null;
  const activityScore = contractCount > 0
    ? clamp((Math.log10(1 + (numberOrNull(chain?.total_volume) ?? 0)) / 6) * 55 + (Math.log10(1 + (numberOrNull(chain?.total_oi) ?? 0)) / 8) * 45)
    : null;
  const contractParts = [spreadScore, depthScore, activityScore].filter((value): value is number => value != null);
  const contractQualityScore = contractParts.length ? clamp(contractParts.reduce((sum, value) => sum + value, 0) / contractParts.length) : null;

  const edgeParts = [
    ratioScore(row.forecast_implied_ratio, POLICY.forecastImpliedMinimum),
    ratioScore(row.expected_return_pct, POLICY.expectedReturnMinimum),
    ratioScore(row.probability_profit, POLICY.probabilityProfitMinimum),
    ratioScore(row.direction_entropy, POLICY.directionEntropyMinimum)
  ];
  const availableEdge = edgeParts.filter((value): value is number => value != null);
  const valueEdgeScore = availableEdge.length === 4
    ? clamp(availableEdge[0] * 0.35 + availableEdge[1] * 0.3 + availableEdge[2] * 0.2 + availableEdge[3] * 0.15)
    : null;
  const movementReadinessScore = numberOrNull(row.move_score_pre);
  const liveConfirmationScore = numberOrNull(row.move_score_live);
  const base = movementReadinessScore != null && liveConfirmationScore != null && valueEdgeScore != null && contractQualityScore != null
    ? movementReadinessScore * 0.2 + liveConfirmationScore * 0.2 + valueEdgeScore * 0.35 + contractQualityScore * 0.25
    : null;
  const adjustedFinalReadinessScore = base == null ? null : clamp(base * Math.min(1, dataQualityScore / 90));
  const hardGateFailures = [
    ...(Array.isArray(row.reason_codes) ? row.reason_codes : []),
    ...(Array.isArray(row.rejection_reasons) ? row.rejection_reasons : []),
    ...(dataQualityScore < POLICY.dataQualityMinimum ? ["DATA_QUALITY_BELOW_MINIMUM"] : []),
    ...(contractQualityScore != null && contractQualityScore < POLICY.contractQualityMinimum ? ["CONTRACT_QUALITY_BELOW_MINIMUM"] : [])
  ].filter((value, index, all) => all.indexOf(value) === index);

  return {
    dataQualityScore,
    movementReadinessScore,
    liveConfirmationScore,
    valueEdgeScore,
    contractQualityScore,
    adjustedFinalReadinessScore,
    hardGateFailures
  };
}

async function latestRuns(prisma: PrismaClient) {
  const runs = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT * FROM fno_volatility.signal_run ORDER BY started_at DESC LIMIT 30`
  );
  return {
    runs,
    liveRun: runs.find((row) => row.stage === "LIVE") ?? null,
    premarketRun: runs.find((row) => row.stage === "PREMARKET") ?? null
  };
}

async function dashboardPayload(prisma: PrismaClient) {
  const { runs, liveRun, premarketRun } = await latestRuns(prisma);
  const premarket = premarketRun
    ? await prisma.$queryRawUnsafe<Row[]>(
        `SELECT p.*,u.cash_symbol_token,u.nearest_future_expiry,u.nearest_option_expiry,
                u.active_option_contracts,u.active_call_contracts,u.active_put_contracts,u.data_status universe_data_status
           FROM fno_volatility.movement_prediction p
           LEFT JOIN fno_volatility.universe_snapshot u ON u.run_id=p.run_id AND u.underlying=p.underlying
          WHERE p.run_id=$1::uuid ORDER BY p.movement_rank NULLS LAST,p.underlying`,
        premarketRun.run_id
      )
    : [];
  const live = liveRun
    ? await prisma.$queryRawUnsafe<Row[]>(
        `SELECT p.*,s.signal_id,s.decision,s.confidence,s.reason_codes,
                c.candidate_id,c.structure_type,c.expiry,c.call_token,c.put_token,c.call_symbol,c.put_symbol,c.call_strike,c.put_strike,
                c.call_bid,c.call_ask,c.put_bid,c.put_ask,c.spot_price,c.futures_price,c.combined_entry_ask,c.combined_mark_bid,
                c.combined_spread_pct,c.implied_move_pct,c.call_iv,c.put_iv,c.predicted_iv_change,
                c.forecast_implied_ratio,c.expected_return_pct,c.probability_profit,c.pnl_p10,c.pnl_p50,
                c.pnl_p90,c.expected_shortfall_95,c.greek_edge_pct,c.quote_as_of,c.quote_source_as_of,c.quote_age_seconds,
                c.data_status,c.rejection_reasons,c.scenario_summary,$2::text AS run_status
           FROM fno_volatility.movement_prediction p
           LEFT JOIN fno_volatility.trade_signal s ON s.run_id=p.run_id AND s.underlying=p.underlying
           LEFT JOIN fno_volatility.option_candidate c ON c.candidate_id=s.candidate_id
          WHERE p.run_id=$1::uuid ORDER BY p.movement_rank NULLS LAST,p.underlying`,
        liveRun.run_id,
        liveRun.status
      )
    : [];
  const [heartbeats, universe, chainHealth] = await Promise.all([
    prisma.$queryRawUnsafe<Row[]>(`SELECT * FROM fno_volatility.service_heartbeat ORDER BY service_name`),
    premarketRun
      ? prisma.$queryRawUnsafe<Row[]>(
          `SELECT count(*)::int total,count(*) FILTER (WHERE data_status='FULL')::int complete,
                  sum(active_option_contracts)::int option_contracts,sum(active_call_contracts)::int call_contracts,
                  sum(active_put_contracts)::int put_contracts
             FROM fno_volatility.universe_snapshot WHERE run_id=$1::uuid`,
          premarketRun.run_id
        )
      : Promise.resolve([]),
    prisma.$queryRawUnsafe<Row[]>(
      `WITH latest AS (SELECT max(ts) ts FROM public.smartapi_option_chain_snapshots)
       SELECT l.ts snapshot_ts,count(*)::int contract_count,count(DISTINCT underlying)::int underlyings,
              count(*) FILTER (WHERE bid>0 AND ask>=bid)::int two_sided_contracts,
              count(*) FILTER (WHERE depth_imbalance IS NOT NULL)::int depth_covered_contracts,
              count(*) FILTER (WHERE coalesce(local_iv,broker_iv)>0)::int greek_covered_contracts,
              count(*) FILTER (WHERE data_quality_status='FULL')::int fresh_contracts,
              count(*) FILTER (WHERE data_quality_status='QUOTE_STALE')::int stale_contracts,
              count(*) FILTER (WHERE data_quality_status='QUOTE_MISSING')::int missing_contracts,
              max(quote_age_seconds)::int maximum_quote_age_seconds,
              extract(epoch FROM (now()-l.ts))::int snapshot_age_seconds,
              CASE WHEN l.ts IS NULL THEN 'UNAVAILABLE'
                   WHEN now()-l.ts > interval '15 minutes' THEN 'STALE_RETRY_ACTIVE'
                   WHEN count(*) FILTER (WHERE data_quality_status='FULL') < count(*) * 0.80 THEN 'DEGRADED_QUOTES'
                   ELSE 'HEALTHY' END watch_status
         FROM latest l LEFT JOIN public.smartapi_option_chain_snapshots c ON c.ts=l.ts GROUP BY l.ts`
    )
  ]);
  return { runs, liveRun, premarketRun, premarket, live, heartbeats, universe: universe[0] ?? null, chainHealth: chainHealth[0] ?? null };
}

export function registerFnoVolatility(app: Express, prisma: PrismaClient) {
  app.get("/v1/fno-volatility/dashboard", async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const payload = await dashboardPayload(prisma);
    res.json({ environment: "PAPER", strategyId: "FNO_VOLATILITY_TWO_GATE", strategyVersion: "1.0.0", modelKind: "TRANSPARENT_PERCENTILE_MVP", ...payload });
  });

  app.get("/v1/options-intelligence/summary", async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const payload = await dashboardPayload(prisma);
    const chainByUnderlying = payload.liveRun ? await prisma.$queryRawUnsafe<Row[]>(
      `WITH target AS (
         SELECT p.underlying,max(c.ts) snapshot_ts
           FROM fno_volatility.movement_prediction p
           LEFT JOIN public.smartapi_option_chain_snapshots c ON c.underlying=p.underlying AND c.ts<=$2::timestamptz
          WHERE p.run_id=$1::uuid GROUP BY p.underlying
       )
       SELECT c.underlying,max(c.ts) snapshot_ts,count(*)::int contract_count,
              count(*) FILTER (WHERE c.bid>0 AND c.ask>=c.bid)::int two_sided_contracts,
              count(*) FILTER (WHERE c.depth_imbalance IS NOT NULL)::int depth_covered_contracts,
              sum(coalesce(c.volume,0))::text total_volume,sum(coalesce(c.oi,0))::text total_oi,
              avg(c.spread_pct) FILTER (WHERE c.spread_pct>=0)::numeric average_spread_pct,
              avg(c.ask) FILTER (WHERE c.ask>0)::numeric average_ask,max(c.quote_age_seconds)::int quote_age_seconds,
              max(c.spot_price)::numeric spot_price,max(c.futures_price)::numeric futures_price
         FROM public.smartapi_option_chain_snapshots c JOIN target t ON c.underlying=t.underlying AND c.ts=t.snapshot_ts GROUP BY c.underlying`,
      payload.liveRun.run_id,
      payload.liveRun.decision_as_of
    ) : [];
    const chainMap = new Map(chainByUnderlying.map((row) => [String(row.underlying), row]));
    const candidates: Row[] = payload.live.map((row): Row => {
      const chain = chainMap.get(String(row.underlying)) ?? null;
      const scores = optionIntelligenceScores(row, chain);
      const decision = row.decision ?? (row.shortlisted ? "WATCH" : "MONITOR");
      return { ...row, ...chain, ...scores, decision };
    });
    const rejectionDistribution = new Map<string, number>();
    for (const row of candidates) for (const reason of row.hardGateFailures) rejectionDistribution.set(reason, (rejectionDistribution.get(reason) ?? 0) + 1);
    res.json({
      environment: "PAPER",
      pageMode: "LIVE_ACTUAL_DATA",
      strategyId: "FNO_VOLATILITY_TWO_GATE",
      strategyVersion: "1.0.0",
      scoringVersion: "OPTIONS_INTELLIGENCE_EXPLAINABLE_V1",
      modelKind: "TRANSPARENT_PERCENTILE_MVP",
      generatedAt: new Date().toISOString(),
      policy: POLICY,
      premarketRun: payload.premarketRun,
      liveRun: payload.liveRun,
      universe: payload.universe,
      chainHealth: payload.chainHealth,
      heartbeats: payload.heartbeats,
      funnel: {
        universe: payload.universe?.total ?? 0,
        premarketShortlist: payload.premarketRun?.shortlisted_underlyings ?? 0,
        liveConfirmed: payload.liveRun?.shortlisted_underlyings ?? 0,
        structuresTested: candidates.filter((row) => row["candidate_id"]).length,
        tradeReady: candidates.filter((row) => row.decision === "BUY_STRADDLE" || row.decision === "BUY_STRANGLE").length
      },
      rejectionDistribution: [...rejectionDistribution.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
      candidates
    });
  });

  app.get("/v1/options-intelligence/candidates/:symbol", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const symbol = String(req.params.symbol ?? "").trim().toUpperCase();
    if (!/^[A-Z0-9&-]{1,32}$/.test(symbol)) return res.status(400).json({ error: { code: "INVALID_SYMBOL", message: "Invalid F&O underlying." } });
    const predictionRows = await prisma.$queryRawUnsafe<Row[]>(
      `SELECT p.*,r.status run_status,r.trade_date,r.run_slot,r.decision_as_of,r.execution_timestamp,r.source_eod_date,r.source_minute_ts,r.source_quote_ts,
              s.signal_id,s.decision,s.confidence,s.reason_codes,c.*
         FROM fno_volatility.movement_prediction p JOIN fno_volatility.signal_run r ON r.run_id=p.run_id
         LEFT JOIN fno_volatility.trade_signal s ON s.run_id=p.run_id AND s.underlying=p.underlying
         LEFT JOIN fno_volatility.option_candidate c ON c.candidate_id=s.candidate_id
        WHERE p.underlying=$1 AND r.stage='LIVE' ORDER BY r.decision_as_of DESC LIMIT 1`,
      symbol
    );
    if (!predictionRows.length) return res.status(404).json({ error: { code: "PREDICTION_NOT_FOUND", message: "No live evaluation exists for this underlying." } });
    const prediction = predictionRows[0];
    const [chain, decisionChainRows] = await Promise.all([prisma.$queryRawUnsafe<Row[]>(
      `WITH selected AS (
         SELECT max(ts) snapshot_ts FROM public.smartapi_option_chain_snapshots WHERE underlying=$1
       ), current_rows AS (
         SELECT c.* FROM public.smartapi_option_chain_snapshots c JOIN selected s ON c.ts=s.snapshot_ts WHERE c.underlying=$1
       )
       SELECT c.ts snapshot_ts,c.underlying,c.expiry,c.symbol_token,c.tradingsymbol,c.strike,c."right",c.lotsize,
              c.spot_price,c.futures_price,c.bid,c.ask,c.midpoint,c.spread,c.spread_pct,c.volume::text,c.oi::text,
              c.total_buy_qty::text,c.total_sell_qty::text,c.depth_imbalance,c.broker_iv,c.broker_delta,c.broker_gamma,c.broker_theta,c.broker_vega,
              c.local_iv,c.local_delta,c.local_gamma,c.local_theta,c.local_vega,c.greek_validation_status,c.quote_age_seconds,c.source_quote_ts,
              c.session_phase,c.data_quality_status,
              (SELECT p.oi::text FROM public.smartapi_option_chain_snapshots p
                WHERE p.underlying=c.underlying AND p.symbol_token=c.symbol_token AND p.ts<c.ts-interval '4 minutes'
                ORDER BY p.ts DESC LIMIT 1) previous_oi
         FROM current_rows c ORDER BY c.strike,c."right"`,
      symbol
    ), prisma.$queryRawUnsafe<Row[]>(
      `WITH selected AS (
         SELECT max(ts) snapshot_ts FROM public.smartapi_option_chain_snapshots WHERE underlying=$1 AND ts<=$2::timestamptz
       )
       SELECT s.snapshot_ts,count(c.symbol_token)::int contract_count,
              count(*) FILTER (WHERE c.bid>0 AND c.ask>=c.bid)::int two_sided_contracts,
              count(*) FILTER (WHERE c.depth_imbalance IS NOT NULL)::int depth_covered_contracts,
              sum(coalesce(c.volume,0))::text total_volume,sum(coalesce(c.oi,0))::text total_oi,
              avg(c.spread_pct) FILTER (WHERE c.spread_pct>=0)::numeric average_spread_pct,
              avg(c.ask) FILTER (WHERE c.ask>0)::numeric average_ask,max(c.quote_age_seconds)::int quote_age_seconds
         FROM selected s LEFT JOIN public.smartapi_option_chain_snapshots c ON c.underlying=$1 AND c.ts=s.snapshot_ts GROUP BY s.snapshot_ts`,
      symbol,
      prediction.decision_as_of
    )]);
    const history = await prisma.$queryRawUnsafe<Row[]>(
      `WITH latest AS (SELECT max(ts) snapshot_ts FROM public.smartapi_option_chain_snapshots WHERE underlying=$1)
       SELECT date_trunc('minute',ts) snapshot_ts,max(spot_price)::numeric spot_price,max(futures_price)::numeric futures_price,
              sum(coalesce(oi,0))::text total_oi,sum(coalesce(volume,0))::text total_volume
         FROM public.smartapi_option_chain_snapshots,latest
        WHERE underlying=$1 AND ts >= latest.snapshot_ts-interval '120 minutes' AND ts<=latest.snapshot_ts
        GROUP BY 1 ORDER BY 1`,
      symbol
    );
    const chainSummary: Row = {
      snapshot_ts: chain[0]?.snapshot_ts ?? null,
      contract_count: chain.length,
      two_sided_contracts: chain.filter((row) => numberOrNull(row.bid)! > 0 && numberOrNull(row.ask)! >= numberOrNull(row.bid)!).length,
      depth_covered_contracts: chain.filter((row) => row.depth_imbalance != null).length,
      total_volume: chain.reduce((sum, row) => sum + (numberOrNull(row.volume) ?? 0), 0),
      total_oi: chain.reduce((sum, row) => sum + (numberOrNull(row.oi) ?? 0), 0),
      average_spread_pct: chain.length ? chain.reduce((sum, row) => sum + (numberOrNull(row.spread_pct) ?? 0), 0) / chain.length : null,
      quote_age_seconds: chain.reduce((maximum, row) => Math.max(maximum, numberOrNull(row.quote_age_seconds) ?? 0), 0)
    };
    const decisionChainSummary = decisionChainRows[0] ?? null;
    const scores = optionIntelligenceScores(prediction, decisionChainSummary);
    const normalizedChain = chain.map((row) => ({
      ...row,
      oiChange: row.previous_oi == null ? null : (numberOrNull(row.oi) ?? 0) - (numberOrNull(row.previous_oi) ?? 0),
      isSelectedCall: String(row.symbol_token) === String(prediction.call_token ?? ""),
      isSelectedPut: String(row.symbol_token) === String(prediction.put_token ?? "")
    }));
    res.json({
      environment: "PAPER",
      pageMode: "LIVE_ACTUAL_DATA",
      symbol,
      scoringVersion: "OPTIONS_INTELLIGENCE_EXPLAINABLE_V1",
      policy: POLICY,
      prediction: { ...prediction, ...scores },
      decisionSnapshot: decisionChainSummary,
      currentSnapshot: chainSummary,
      chain: normalizedChain,
      history,
      provenance: {
        prediction: "fno_volatility.movement_prediction + option_candidate + trade_signal",
        currentChain: "public.smartapi_option_chain_snapshots",
        underlyingHistory: "public.smartapi_option_chain_snapshots (minute snapshots)",
        decisionAsOf: prediction.decision_as_of,
        chainAsOf: chainSummary.snapshot_ts,
        note: "Decision evidence is immutable. Current-chain monitoring is shown separately and never rewrites the original decision."
      }
    });
  });
}
