import type { Express } from "express";
import type { PrismaClient } from "@prisma/client";

type Row = Record<string, any>;

export const LONG_OPTIONS_POLICY = {
  policyId: "LONG_ONLY_OPTIONS_ROUTER",
  version: "2.0.0",
  environment: "PAPER",
  dqsMinimum: 85,
  mrsMinimum: 55,
  lcsMinimum: 60,
  cqsMinimum: 75,
  finalScoreMinimum: 75,
  expectedNetMinimumInr: 1500,
  targetNetInr: 1000,
  targetProbabilityMinimum: 0.6,
  stockSpreadHardVeto: 0.08,
  optionQuoteHealthySeconds: 3,
  optionQuoteHardStaleSeconds: 7,
  fixedExitIst: "15:10",
  entryCutoffIst: "11:00",
  maximumGroupsPerDay: 2,
  maximumPremiumRiskPerGroupInr: 50000,
  maximumDailyPremiumRiskInr: 100000,
  enabled: {
    BUY_ATM_STRADDLE: "PAPER",
    BUY_DELTA_STRANGLE: "PAPER",
    BUY_CALL: "SHADOW_DISABLED_PENDING_DIRECTION_VALIDATION",
    BUY_PUT: "SHADOW_DISABLED_PENDING_DIRECTION_VALIDATION",
  },
} as const;

function value(input: unknown): number | null {
  if (input == null || input === "") return null;
  const parsed = Number(input);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(input: number, minimum = 0, maximum = 100) {
  return Math.max(minimum, Math.min(maximum, input));
}

function ratioScore(input: unknown, threshold: number) {
  const parsed = value(input);
  return parsed == null ? null : clamp((parsed / threshold) * 75);
}

function normalCdf(input: number) {
  const sign = input < 0 ? -1 : 1;
  const x = Math.abs(input) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const erf = sign * (1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-x * x));
  return 0.5 * (1 + erf);
}

export function estimateTradingCharges(buyTurnover: number, sellTurnover: number, orderCount: number) {
  const brokerage = 20 * orderCount;
  const stt = 0.0015 * sellTurnover;
  const exchangeCharges = 0.0003553 * (buyTurnover + sellTurnover);
  const sebiCharges = 0.000001 * (buyTurnover + sellTurnover);
  const stampDuty = 0.00003 * buyTurnover;
  const gst = 0.18 * (brokerage + exchangeCharges + sebiCharges);
  const total = brokerage + stt + exchangeCharges + sebiCharges + stampDuty + gst;
  return { brokerage, stt, exchangeCharges, sebiCharges, stampDuty, gst, total };
}

function strategyType(structureType: unknown): "BUY_ATM_STRADDLE" | "BUY_DELTA_STRANGLE" {
  return String(structureType) === "ATM_STRADDLE" ? "BUY_ATM_STRADDLE" : "BUY_DELTA_STRANGLE";
}

export function evaluateLongOptionCandidate(row: Row) {
  const strategy = strategyType(row.structure_type);
  const quoteAge = value(row.quote_age_seconds);
  const callBid = value(row.call_bid);
  const callAsk = value(row.call_ask);
  const putBid = value(row.put_bid);
  const putAsk = value(row.put_ask);
  const combinedAsk = value(row.combined_entry_ask) ?? ((callAsk ?? 0) + (putAsk ?? 0));
  const combinedBid = value(row.combined_mark_bid) ?? ((callBid ?? 0) + (putBid ?? 0));
  const lotSize = value(row.lot_size) ?? 0;
  const premiumRisk = combinedAsk > 0 && lotSize > 0 ? combinedAsk * lotSize : null;
  const coherentIdentity = Boolean(row.expiry && row.call_token && row.put_token && row.call_symbol && row.put_symbol && lotSize > 0);
  const twoSided = [callBid, callAsk, putBid, putAsk].every((item) => item != null && item > 0) && callAsk! >= callBid! && putAsk! >= putBid!;
  const freshness = quoteAge == null ? 0 : quoteAge <= 3 ? 25 : quoteAge <= 7 ? 18 : 0;
  // Sequence continuity is intentionally not inferred from the presence of a
  // quote timestamp. Until the source run persists a reconciled watermark the
  // missing 15-point component remains absent and is also a hard veto below.
  const dqs = clamp((coherentIdentity ? 25 : 0) + freshness + (twoSided ? 15 : 0) + (combinedAsk > 0 && combinedBid >= 0 ? 10 : 0) + (row.run_status === "COMPLETED" ? 10 : 0));
  const mrs = value(row.move_score_pre);
  const lcs = value(row.move_score_live);
  const probabilityUp = value(row.probability_up);
  const directionalEdgeScore = probabilityUp == null ? null : clamp(Math.abs(probabilityUp - 0.5) * 200);
  const spread = value(row.combined_spread_pct);
  const spreadScore = spread == null ? null : spread <= 0.03 ? 100 : spread <= 0.08 ? clamp(100 - ((spread - 0.03) / 0.05) * 100) : 0;
  const cqsParts = [spreadScore, twoSided ? 100 : 0, quoteAge != null && quoteAge <= 3 ? 100 : quoteAge != null && quoteAge <= 7 ? 60 : 0, value(row.call_iv) != null && value(row.put_iv) != null ? 100 : 0];
  const cqs = cqsParts.reduce<number>((sum, item) => sum + (item ?? 0), 0) / cqsParts.length;
  const edgeParts = [
    ratioScore(row.forecast_implied_ratio, strategy === "BUY_DELTA_STRANGLE" ? 1.3 : 1.15),
    ratioScore(row.expected_return_pct, 0.05),
    ratioScore(row.probability_profit, 0.55),
  ];
  const availableEdge = edgeParts.filter((item): item is number => item != null);
  const ves = availableEdge.length === 3 ? availableEdge.reduce((sum, item) => sum + item, 0) / 3 : null;
  const entropy = value(row.direction_entropy);
  const entropyScore = entropy == null ? null : clamp(entropy * 100);
  const baseScore = mrs != null && lcs != null && ves != null
    ? strategy === "BUY_ATM_STRADDLE"
      ? 0.15 * mrs + 0.2 * lcs + 0.35 * ves + 0.2 * cqs + 0.1 * (entropyScore ?? 0)
      : 0.15 * mrs + 0.2 * lcs + 0.3 * ves + 0.2 * cqs + 0.1 * (value(row.tail_edge_score) ?? 0) + 0.05 * (value(row.wing_symmetry_score) ?? 0)
    : null;
  const adjustedScore = baseScore == null ? null : clamp(baseScore * Math.min(1, dqs / 90));
  const expectedReturn = value(row.expected_return_pct);
  const expectedNet = premiumRisk != null && expectedReturn != null ? premiumRisk * expectedReturn : null;
  const roundTripOrders = 4;
  const markTurnover = combinedBid > 0 && lotSize > 0 ? combinedBid * lotSize : 0;
  const charges = premiumRisk != null ? estimateTradingCharges(premiumRisk, markTurnover, roundTripOrders) : null;
  const p10 = value(row.pnl_p10);
  const p50 = value(row.pnl_p50);
  const p90 = value(row.pnl_p90);
  let targetProbability: number | null = null;
  if (premiumRisk && p10 != null && p50 != null && p90 != null) {
    const sigma = Math.max((p90 - p10) / 2.563103, 1e-6);
    const targetReturn = LONG_OPTIONS_POLICY.targetNetInr / premiumRisk;
    targetProbability = clamp(1 - normalCdf((targetReturn - p50) / sigma), 0, 1);
  }
  const reasons = new Set<string>(Array.isArray(row.rejection_reasons) ? row.rejection_reasons : []);
  if (!coherentIdentity) reasons.add("CONTRACT_MISMATCH");
  if (!twoSided) reasons.add("TWO_SIDED_QUOTE_MISSING");
  if (row.sequence_reconciled !== true) reasons.add("SEQUENCE_CONTINUITY_NOT_VERIFIED");
  if (row.event_gate_status == null) reasons.add("EVENT_STATE_UNKNOWN");
  if (row.best_ask_depth_lots_call == null || row.best_ask_depth_lots_put == null) reasons.add("BEST_ASK_DEPTH_NOT_ESTIMABLE");
  if (quoteAge == null || quoteAge > LONG_OPTIONS_POLICY.optionQuoteHardStaleSeconds) reasons.add("QUOTE_STALE");
  if (dqs < LONG_OPTIONS_POLICY.dqsMinimum) reasons.add("DQS_GATE_FAIL");
  if (mrs == null || mrs < LONG_OPTIONS_POLICY.mrsMinimum) reasons.add("MRS_GATE_FAIL");
  if (lcs == null || lcs < LONG_OPTIONS_POLICY.lcsMinimum) reasons.add("LCS_GATE_FAIL");
  if (cqs < LONG_OPTIONS_POLICY.cqsMinimum) reasons.add("CQS_GATE_FAIL");
  if (spread == null || spread > LONG_OPTIONS_POLICY.stockSpreadHardVeto) reasons.add("SPREAD_VETO");
  if (entropy == null || entropy < 0.9) reasons.add("ENTROPY_ROUTE_FAIL");
  if (strategy === "BUY_ATM_STRADDLE" && value(row.call_strike) !== value(row.put_strike)) reasons.add("ATM_SAME_STRIKE_REQUIRED");
  if (strategy === "BUY_DELTA_STRANGLE") {
    const callDelta = value(row.call_delta);
    const putDelta = value(row.put_delta);
    if (callDelta == null || putDelta == null) reasons.add("WING_DELTA_NOT_ESTIMABLE");
    else if (Math.abs(callDelta) < 0.25 || Math.abs(callDelta) > 0.35 || Math.abs(putDelta) < 0.25 || Math.abs(putDelta) > 0.35) reasons.add("WING_DELTA_OUT_OF_RANGE");
    const tailRatio = value(row.tail_ratio_p90_to_p75);
    if (tailRatio == null) reasons.add("TAIL_RATIO_NOT_ESTIMABLE");
    else if (tailRatio < 1.55) reasons.add("TAIL_RATIO_GATE_FAIL");
  }
  if (expectedNet == null || expectedNet < LONG_OPTIONS_POLICY.expectedNetMinimumInr) reasons.add("EXPECTED_NET_GATE_FAIL");
  if (targetProbability == null) reasons.add("TARGET_PROBABILITY_NOT_ESTIMABLE");
  else if (targetProbability < LONG_OPTIONS_POLICY.targetProbabilityMinimum) reasons.add("TARGET_PROBABILITY_FAIL");
  if (premiumRisk == null || premiumRisk > LONG_OPTIONS_POLICY.maximumPremiumRiskPerGroupInr) reasons.add("PREMIUM_RISK_LIMIT");
  if (adjustedScore == null || adjustedScore < LONG_OPTIONS_POLICY.finalScoreMinimum) reasons.add("FINAL_SCORE_GATE_FAIL");
  const hardGateFailures = [...reasons];
  return {
    ...row,
    strategyType: strategy,
    enabledState: LONG_OPTIONS_POLICY.enabled[strategy],
    decision: hardGateFailures.length ? "NO_TRADE" : "READY",
    dqs,
    mrs,
    lcs,
    directionalEdgeScore,
    ves,
    cqs,
    entropyScore,
    adjustedScore,
    premiumRiskInr: premiumRisk,
    expectedNetAfterChargesInr: expectedNet,
    probabilityNetGe1000: targetProbability,
    targetProbabilityModel: "NORMAL_QUANTILE_APPROX_V1",
    estimatedRoundTripCharges: charges,
    hardGateFailures,
    safety: { openingSide: "BUY", closingSide: "SELL", liveOrdersEnabled: false },
  };
}

async function loadLongOptions(prisma: PrismaClient) {
  const runs = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT * FROM fno_volatility.signal_run ORDER BY started_at DESC LIMIT 30`,
  );
  const latestRun = runs[0] ?? null;
  const evidenceRun = runs.find((run) => run.stage === "LIVE" && Number(run.shortlisted_underlyings) > 0) ?? null;
  const premarketRun = evidenceRun
    ? runs.find((run) => String(run.trade_date).slice(0, 10) === String(evidenceRun.trade_date).slice(0, 10) && run.stage === "PREMARKET" && run.status === "COMPLETED") ?? null
    : null;
  const rows = evidenceRun ? await prisma.$queryRawUnsafe<Row[]>(
    `SELECT p.*,r.status run_status,r.trade_date,r.run_slot,r.decision_as_of,r.completed_at,
            c.*,s.decision source_decision,s.confidence,s.reason_codes
       FROM fno_volatility.movement_prediction p
       JOIN fno_volatility.signal_run r ON r.run_id=p.run_id
       LEFT JOIN fno_volatility.trade_signal s ON s.run_id=p.run_id AND s.underlying=p.underlying
       LEFT JOIN fno_volatility.option_candidate c ON c.run_id=p.run_id AND c.underlying=p.underlying
      WHERE p.run_id=$1::uuid
      ORDER BY p.movement_rank NULLS LAST,c.expected_return_pct DESC NULLS LAST,c.structure_type`,
    evidenceRun.run_id,
  ) : [];
  const candidates: Row[] = rows.filter((row) => row.candidate_id).map(evaluateLongOptionCandidate);
  const directionalShadow = rows
    .filter((row, index, all) => all.findIndex((candidate) => candidate.underlying === row.underlying) === index)
    .flatMap((row) => ["BUY_CALL", "BUY_PUT"].map((strategy) => ({
      underlying: row.underlying,
      strategyType: strategy,
      enabledState: LONG_OPTIONS_POLICY.enabled[strategy as "BUY_CALL" | "BUY_PUT"],
      decision: "SHADOW_DISABLED",
      probabilityUp: value(row.probability_up),
      directionEntropy: value(row.direction_entropy),
      mrs: value(row.move_score_pre),
      lcs: value(row.move_score_live),
      reason: "DIRECTION_MODEL_NOT_PROMOTED",
    })));
  const rejectionCounts = new Map<string, number>();
  for (const candidate of candidates) for (const reason of candidate.hardGateFailures) rejectionCounts.set(reason, (rejectionCounts.get(reason) ?? 0) + 1);
  return {
    strategyFamily: "LONG_ONLY_OPTIONS_ROUTER",
    strategyVersion: LONG_OPTIONS_POLICY.version,
    environment: "PAPER",
    generatedAt: new Date().toISOString(),
    liveOrdersEnabled: false,
    sourceStrategyFamily: "FNO_VOLATILITY_TWO_GATE",
    latestRun,
    evidenceRun,
    policy: LONG_OPTIONS_POLICY,
    candidates,
    directionalShadow,
    summary: {
      evaluatedStructures: candidates.length,
      readyStructures: candidates.filter((candidate) => candidate.decision === "READY").length,
      rejectedStructures: candidates.filter((candidate) => candidate.decision !== "READY").length,
      underlyings: new Set(candidates.map((candidate) => candidate.underlying)).size,
      fullFnoUniverse: Number(premarketRun?.requested_underlyings ?? evidenceRun?.requested_underlyings ?? 0),
      premarketEvaluated: Number(premarketRun?.evaluated_underlyings ?? 0),
      premarketShortlist: Number(premarketRun?.shortlisted_underlyings ?? 0),
      liveEvaluated: Number(evidenceRun?.evaluated_underlyings ?? 0),
      liveShortlist: Number(evidenceRun?.shortlisted_underlyings ?? 0),
      callPutPromotionState: "SHADOW_DISABLED_PENDING_DIRECTION_VALIDATION",
      straddleState: "PAPER",
      strangleState: "PAPER",
    },
    rejectionDistribution: [...rejectionCounts.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    provenance: {
      movement: "fno_volatility.movement_prediction",
      structures: "fno_volatility.option_candidate",
      contracts: "public.smartapi_option_chain_snapshots + public.derivative_token_plan",
      note: "Independent long-options router. It does not read or write OIIS or Rolling Monthly tables.",
      unavailableHardGateInputs: [
        "sequence_reconciled",
        "event_gate_status",
        "best_ask_depth_lots_call",
        "best_ask_depth_lots_put",
        "call_delta",
        "put_delta",
        "tail_ratio_p90_to_p75",
      ],
    },
  };
}

export function registerLongOptions(app: Express, prisma: PrismaClient) {
  app.get("/v1/long-options/summary", async (_req, res, next) => {
    try {
      res.json(await loadLongOptions(prisma));
    } catch (error) { next(error); }
  });

  app.get("/v1/long-options/candidates", async (_req, res, next) => {
    try {
      const payload = await loadLongOptions(prisma);
      res.json({ generatedAt: payload.generatedAt, evidenceRun: payload.evidenceRun, candidates: payload.candidates });
    } catch (error) { next(error); }
  });

  app.get("/v1/long-options/candidates/:symbol", async (req, res, next) => {
    try {
      const symbol = String(req.params.symbol ?? "").trim().toUpperCase();
      if (!/^[A-Z0-9&-]{1,32}$/.test(symbol)) return res.status(400).json({ error: { code: "INVALID_SYMBOL", message: "Invalid F&O underlying." } });
      const payload = await loadLongOptions(prisma);
      const candidates = payload.candidates.filter((candidate) => candidate.underlying === symbol);
      const directionalShadow = payload.directionalShadow.filter((candidate) => candidate.underlying === symbol);
      if (!candidates.length && !directionalShadow.length) return res.status(404).json({ error: { code: "LONG_OPTIONS_CANDIDATE_NOT_FOUND", message: "No long-options evaluation exists for this symbol in the latest evidence run." } });
      res.json({ strategyFamily: payload.strategyFamily, generatedAt: payload.generatedAt, evidenceRun: payload.evidenceRun, policy: payload.policy, candidates, directionalShadow, provenance: payload.provenance });
    } catch (error) { next(error); }
  });
}
