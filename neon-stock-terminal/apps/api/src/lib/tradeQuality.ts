export type TradeQualityAssetClass = "EQUITY" | "OPTION";
export type CriterionStatus = "SCORED" | "NOT_ESTIMABLE" | "NOT_MATURE";

export type TradeQualityCriterion = {
  id: string;
  phase: "PROCESS" | "OUTCOME";
  title: string;
  weight: number;
  rating: number | null;
  points: number | null;
  status: CriterionStatus;
  reason: string;
};

export type TradeQualityPolicyCriterion = Pick<TradeQualityCriterion, "id" | "phase" | "title" | "weight">;

export type TradeQualityInput = {
  assetClass: TradeQualityAssetClass;
  status?: string | null;
  processRatings?: Record<string, number | null | undefined>;
  outcomeRatings?: Record<string, number | null | undefined>;
  processEvidenceReasons?: Record<string, string>;
  outcomeEvidenceReasons?: Record<string, string>;
  hardFailFlags?: string[];
  dataInvalid?: boolean;
  effectiveRisk?: number | null;
  afterTaxPnl?: number | null;
  realisedPnl?: number | null;
  maeR?: number | null;
  mfeR?: number | null;
  drawdownBudgetShare?: number | null;
  exitCaptureRatio?: number | null;
  costDragR?: number | null;
  holdingEfficiencyRatio?: number | null;
};

export type TradeQualityHardFail = { id: string; title: string; detail: string };

const cashHardFails: TradeQualityHardFail[] = [
  ["C_H01", "Risk was undefined", "Initial stop or maximum loss was not defined before entry."],
  ["C_H02", "Position size breached policy", "Capital risk, sector concentration, portfolio heat or drawdown budget was exceeded."],
  ["C_H03", "Stop was widened", "The stop was moved farther away solely to avoid exiting."],
  ["C_H04", "Unplanned averaging", "Averaging increased the original maximum risk without governed approval."],
  ["C_H05", "Outside approved strategy", "The trade was taken outside the versioned strategy without documented approval."],
  ["C_H06", "Expected value unknown or negative", "Expected value after costs was negative or not established at entry."],
  ["C_H07", "Exit liquidity inadequate", "The position could not reasonably be exited within the approved friction and stress assumptions."],
  ["C_H08", "Known event ignored", "A known result, corporate action or market event was not included in the risk decision."],
  ["C_H09", "Data invalid", "Incorrect, stale, inconsistent or future information was used."],
  ["C_H10", "Loss exceeded governed risk", "Realised loss materially exceeded 1R without a documented gap exception."],
  ["C_H11", "Drawdown mandate breached", "The result required account drawdown inconsistent with the approved mandate."],
  ["C_H12", "Profit was accidental", "Profit arose primarily from an unplanned event rather than the recorded thesis."],
].map(([id, title, detail]) => ({ id, title, detail }));

const optionHardFails: TradeQualityHardFail[] = [
  ["O_H01", "Contract was incorrect", "Underlying, expiry, strike, option side, lot size or quantity was wrong."],
  ["O_H02", "Leg missing or unmanaged", "A leg failed or was absent while residual exposure remained unmanaged."],
  ["O_H03", "Economic risk was not calculated", "Stop, stress and maximum strategy loss were not calculated before entry."],
  ["O_H04", "Sizing used margin or premium", "Position size used collateral or premium received instead of economic risk."],
  ["O_H05", "Tail risk was unbounded", "Unhedged short-option loss could breach account risk limits."],
  ["O_H06", "Portfolio Greeks or margin breached", "Approved delta, gamma, vega, margin or drawdown limits were exceeded."],
  ["O_H07", "Settlement plan missing", "Stock-option expiry lacked physical-settlement and funding or securities planning."],
  ["O_H08", "Volatility event ignored", "Expected IV expansion or crush was omitted from the entry decision."],
  ["O_H09", "Expiry mismatched the thesis", "DTE was shorter than the expected thesis horizon or expiry was wrong."],
  ["O_H10", "Execution friction invalidated edge", "Combined bid-ask and legging friction was too large for the payoff."],
  ["O_H11", "Adjustment increased maximum loss", "An adjustment increased risk without a fresh approval and calculation."],
  ["O_H12", "Option evidence was stale", "Greeks, IV or option-chain evidence was stale or internally inconsistent."],
  ["O_H13", "Trade family was split", "A multi-leg position was evaluated leg-by-leg instead of as one strategy."],
  ["O_H14", "Forced broker action occurred", "A margin call, forced square-off or unintended exercise occurred."],
  ["O_H15", "Profit came from unintended exposure", "The profitable outcome depended on a risk not present in the original thesis."],
  ["O_H16", "Rules changed to avoid loss", "Stop or adjustment rules were changed merely to avoid recording a loss."],
].map(([id, title, detail]) => ({ id, title, detail }));

const cash: TradeQualityPolicyCriterion[] = [
  ["C01", "PROCESS", "Trade plan and data integrity", 3],
  ["C02", "PROCESS", "Nifty regime and volatility alignment", 6],
  ["C03", "PROCESS", "Sector and stock relative strength", 6],
  ["C04", "PROCESS", "Technical setup quality", 8],
  ["C05", "PROCESS", "Entry location and timing", 5],
  ["C06", "PROCESS", "Liquidity and expected friction", 4],
  ["C07", "PROCESS", "Expected value and net reward-risk", 6],
  ["C08", "PROCESS", "Stop, invalidation and gap-loss plan", 5],
  ["C09", "PROCESS", "Position sizing, heat and correlation", 7],
  ["C10", "PROCESS", "Event, corporate and overnight risk", 5],
  ["C11", "OUTCOME", "Net after-tax profitability", 14],
  ["C12", "OUTCOME", "MAE and account drawdown contribution", 11],
  ["C13", "OUTCOME", "MFE capture and exit quality", 6],
  ["C14", "OUTCOME", "Holding-time and capital efficiency", 4],
  ["C15", "OUTCOME", "Actual slippage and charge drag", 3],
  ["C16", "OUTCOME", "Rule adherence and trader behaviour", 4],
  ["C17", "OUTCOME", "Portfolio interaction and recovery", 3]
].map(([id, phase, title, weight]) => ({ id: String(id), phase: phase as "PROCESS" | "OUTCOME", title: String(title), weight: Number(weight) }));

const options: TradeQualityPolicyCriterion[] = [
  ["O01", "PROCESS", "Trade plan and contract accuracy", 3],
  ["O02", "PROCESS", "Underlying thesis and Nifty regime", 7],
  ["O03", "PROCESS", "Strategy-structure suitability", 8],
  ["O04", "PROCESS", "Implied-volatility edge", 7],
  ["O05", "PROCESS", "Greeks and scenario stress testing", 8],
  ["O06", "PROCESS", "DTE, expiry and gamma-theta path", 5],
  ["O07", "PROCESS", "Payoff, breakeven and expected value", 6],
  ["O08", "PROCESS", "Maximum loss, sizing, margin and portfolio Greeks", 9],
  ["O09", "PROCESS", "Liquidity and combined execution", 5],
  ["O10", "PROCESS", "Event, settlement and exercise risk", 2],
  ["O11", "OUTCOME", "Net after-tax strategy P&L", 12],
  ["O12", "OUTCOME", "MAE, drawdown and stress-loss control", 11],
  ["O13", "OUTCOME", "Exit, adjustment and MFE capture", 6],
  ["O14", "OUTCOME", "P&L source versus intended Greeks", 4],
  ["O15", "OUTCOME", "Cost, capital and margin efficiency", 4],
  ["O16", "OUTCOME", "Rule adherence and reconciliation", 3]
].map(([id, phase, title, weight]) => ({ id: String(id), phase: phase as "PROCESS" | "OUTCOME", title: String(title), weight: Number(weight) }));

export const TRADE_QUALITY_POLICY = {
  policyId: "n50-trade-quality",
  version: "1.1.0",
  effectiveFrom: "2026-08-14",
  ratingScale: { minimum: 0, maximum: 5 },
  leakageRule: "PROCESS criteria use only evidence timestamped at or before entry. Post-entry evidence is OUTCOME only.",
  completenessRule: "Entry-time evidence produces a live normalised estimate once process coverage reaches 80%. A closed trade becomes a full 100-point score at 70% outcome coverage; developing outcomes remain explicitly marked.",
  cash: { processMaximum: 55, outcomeMaximum: 45, processGatePct: 75, outcomeGatePct: 65, criteria: cash, hardFails: cashHardFails },
  options: { processMaximum: 60, outcomeMaximum: 40, processGatePct: 80, outcomeGatePct: 65, criteria: options, hardFails: optionHardFails },
  grades: [
    { minimum: 85, label: "GOOD_HIGH" },
    { minimum: 75, label: "GOOD_MEDIUM" },
    { minimum: 65, label: "GOOD_LOW" },
    { minimum: 55, label: "WEAK" },
    { minimum: 0, label: "BAD" }
  ],
  hardFailPrinciple: "A confirmed critical risk failure produces BAD_RISK regardless of profit. ATR, canonical point-in-time market evidence and actual execution records are used as explicit fallbacks before evidence is considered unavailable."
} as const;

function finite(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function band(value: number, levels: number[]): number {
  for (let rating = 5; rating >= 1; rating -= 1) {
    if (value >= levels[5 - rating]) return rating;
  }
  return 0;
}

function profitRating(value: number, assetClass: TradeQualityAssetClass) {
  return assetClass === "OPTION"
    ? band(value, [1.5, 1, 0.4, 0, -1])
    : band(value, [2, 1.25, 0.5, 0, -1]);
}

function maeRating(value: number, assetClass: TradeQualityAssetClass) {
  const mae = Math.abs(value);
  const upper = assetClass === "OPTION" ? 1.15 : 1.25;
  return mae <= 0.25 ? 5 : mae <= 0.5 ? 4 : mae <= 0.75 ? 3 : mae <= 1 ? 2 : mae <= upper ? 1 : 0;
}

function drawdownRating(value: number) {
  return value <= 0.1 ? 5 : value <= 0.15 ? 4 : value <= 0.2 ? 3 : value <= 0.25 ? 2 : value <= 0.3 ? 1 : 0;
}

function captureRating(value: number) {
  return value >= 0.75 ? 5 : value >= 0.6 ? 4 : value >= 0.4 ? 3 : value >= 0.2 ? 2 : value >= 0 ? 1 : 0;
}

function explicitRating(value: unknown): number | null {
  const rating = finite(value);
  return rating == null ? null : Math.max(0, Math.min(5, rating));
}

export function scoreTradeQuality(input: TradeQualityInput) {
  const policy = input.assetClass === "OPTION" ? TRADE_QUALITY_POLICY.options : TRADE_QUALITY_POLICY.cash;
  const closed = String(input.status ?? "").toUpperCase() === "CLOSED";
  const outcomeIds = input.assetClass === "OPTION"
    ? { profit: "O11", mae: "O12", capture: "O13", time: "O15", cost: "O15" }
    : { profit: "C11", mae: "C12", capture: "C13", time: "C14", cost: "C15" };
  const derived = new Map<string, { rating: number; reason: string }>();
  const afterTaxR = finite(input.effectiveRisk) && Number(input.effectiveRisk) > 0 && finite(input.afterTaxPnl) != null
    ? Number(input.afterTaxPnl) / Number(input.effectiveRisk) : null;
  if (afterTaxR != null) derived.set(outcomeIds.profit, { rating: profitRating(afterTaxR, input.assetClass), reason: `${closed ? "After-tax result" : "Current after-cost mark"} ${afterTaxR.toFixed(2)}R${closed ? "." : "; outcome is still developing."}` });
  if (finite(input.maeR) != null) {
    let rating = maeRating(Number(input.maeR), input.assetClass);
    if (finite(input.drawdownBudgetShare) != null) rating = Math.min(rating, drawdownRating(Number(input.drawdownBudgetShare)));
    derived.set(outcomeIds.mae, { rating, reason: `MAE ${Math.abs(Number(input.maeR)).toFixed(2)}R${finite(input.drawdownBudgetShare) == null ? "" : `; drawdown budget ${(Number(input.drawdownBudgetShare) * 100).toFixed(1)}%`}.` });
  }
  if (finite(input.exitCaptureRatio) != null) derived.set(outcomeIds.capture, { rating: captureRating(Number(input.exitCaptureRatio)), reason: `${closed ? "Exit captured" : "Current mark captures"} ${(Number(input.exitCaptureRatio) * 100).toFixed(1)}% of accessible MFE${closed ? "." : "; outcome is still developing."}` });
  if (finite(input.holdingEfficiencyRatio) != null) derived.set(outcomeIds.time, { rating: Math.max(0, Math.min(5, Math.round((1 - Number(input.holdingEfficiencyRatio)) * 5))), reason: `${closed ? "Holding time" : "Elapsed holding time"} versus governed horizon.` });
  if (finite(input.costDragR) != null) derived.set(outcomeIds.cost, { rating: Number(input.costDragR) <= 0.05 ? 5 : Number(input.costDragR) <= 0.15 ? 3 : Number(input.costDragR) <= 0.25 ? 1 : 0, reason: `Cost drag ${Number(input.costDragR).toFixed(2)}R.` });

  const criteria: TradeQualityCriterion[] = policy.criteria.map((criterion) => {
    const explicit = explicitRating(criterion.phase === "PROCESS" ? input.processRatings?.[criterion.id] : input.outcomeRatings?.[criterion.id]);
    const evidenceReason = criterion.phase === "PROCESS" ? input.processEvidenceReasons?.[criterion.id] : input.outcomeEvidenceReasons?.[criterion.id];
    const value = explicit == null ? derived.get(criterion.id) : { rating: explicit, reason: evidenceReason ?? "Versioned evidence rating supplied by the trade record." };
    if (!value) return { ...criterion, rating: null, points: null, status: criterion.phase === "OUTCOME" && !closed ? "NOT_MATURE" : "NOT_ESTIMABLE", reason: criterion.phase === "OUTCOME" && !closed ? "Outcome is still developing." : "Required source evidence was not captured; it is not treated as a failure." };
    return { ...criterion, rating: value.rating, points: Number((criterion.weight * value.rating / 5).toFixed(2)), status: "SCORED", reason: value.reason };
  });

  const component = (phase: "PROCESS" | "OUTCOME", maximum: number) => {
    const rows = criteria.filter((criterion) => criterion.phase === phase);
    const coveredWeight = rows.filter((criterion) => criterion.status === "SCORED").reduce((sum, criterion) => sum + criterion.weight, 0);
    const points = rows.reduce((sum, criterion) => sum + (criterion.points ?? 0), 0);
    return { points: Number(points.toFixed(2)), maximum, coveragePct: Number((coveredWeight / maximum * 100).toFixed(2)), scorePct: coveredWeight ? Number((points / coveredWeight * 100).toFixed(2)) : null };
  };
  const process = component("PROCESS", policy.processMaximum);
  const outcome = component("OUTCOME", policy.outcomeMaximum);
  const hardFailFlags = [...new Set((input.hardFailFlags ?? []).filter(Boolean))];
  const criticalRiskComplete = policy.criteria.filter((criterion) => criterion.phase === "PROCESS" && /risk|stop|sizing|margin|settlement/i.test(criterion.title)).every((criterion) => criteria.find((row) => row.id === criterion.id)?.status === "SCORED");
  const scoreComplete = closed && process.coveragePct >= 80 && criticalRiskComplete && outcome.coveragePct >= 70;
  const coveredWeight = policy.criteria.filter((criterion) => criteria.find((row) => row.id === criterion.id)?.status === "SCORED").reduce((sum, criterion) => sum + criterion.weight, 0);
  const observedPoints = process.points + outcome.points;
  const totalScore = scoreComplete
    ? Number(observedPoints.toFixed(2))
    : process.coveragePct >= 80 && coveredWeight > 0
      ? Number((observedPoints / coveredWeight * 100).toFixed(2))
      : null;
  let label = input.dataInvalid ? "DATA_INVALID" : hardFailFlags.length ? "BAD_RISK" : "NOT_ESTIMABLE";
  if (totalScore != null && !hardFailFlags.length && !input.dataInvalid) {
    const processHigh = (process.scorePct ?? 0) >= (input.assetClass === "OPTION" ? 80 : 75);
    const outcomeHigh = (outcome.scorePct ?? 0) >= 65;
    if (closed && processHigh && !outcomeHigh && afterTaxR != null && afterTaxR > -1 && afterTaxR < 0) label = "VALID_LOSS";
    else if (!processHigh && afterTaxR != null && afterTaxR > 0) label = "LUCKY_WIN";
    else label = TRADE_QUALITY_POLICY.grades.find((grade) => totalScore >= grade.minimum)?.label ?? "BAD";
  }
  return { policyId: TRADE_QUALITY_POLICY.policyId, policyVersion: TRADE_QUALITY_POLICY.version, assetClass: input.assetClass, status: scoreComplete ? "COMPLETE" : input.dataInvalid ? "DATA_INVALID" : closed ? "ESTIMATED" : "DEVELOPING", scoreBasis: scoreComplete ? "FULL_100_POINT" : totalScore == null ? "INSUFFICIENT_PROCESS_EVIDENCE" : "NORMALISED_AVAILABLE_EVIDENCE", process, outcome, totalScore, label, hardFailFlags, criticalRiskComplete, criteria };
}

type EvidenceBundle = {
  ratings: Record<string, number>;
  reasons: Record<string, string>;
  hardFailFlags: string[];
  effectiveRisk: number | null;
  costDragR: number | null;
  drawdownBudgetShare: number | null;
  holdingEfficiencyRatio: number | null;
};

function object(value: unknown): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, any>;
}

function ratingFromPercent(...values: unknown[]) {
  const usable = values.map(finite).filter((value): value is number => value != null);
  if (!usable.length) return null;
  return Number((Math.max(0, Math.min(100, usable.reduce((sum, value) => sum + value, 0) / usable.length)) / 20).toFixed(2));
}

function automaticCashEvidence(row: Record<string, unknown>): EvidenceBundle {
  const ratings: Record<string, number> = {};
  const reasons: Record<string, string> = {};
  const hardFailFlags: string[] = [];
  const scores = object(row.evidence_component_scores);
  const xfactor = object(scores.xfactor);
  const x = object(xfactor.components);
  const direction = String(row.side).toUpperCase() === "SELL" ? "short" : "long";
  const ofactor = object(scores[`ofactor_${direction}`]);
  const o = object(ofactor.components);
  const availableAt = row.evidence_available_at ? new Date(String(row.evidence_available_at)) : null;
  const openedAt = row.opened_at ? new Date(String(row.opened_at)) : null;
  const pointInTimeSafe = !!availableAt && !!openedAt && availableAt.getTime() <= openedAt.getTime();
  const set = (id: string, rating: number | null, reason: string) => {
    if (rating == null || !pointInTimeSafe) return;
    ratings[id] = rating;
    reasons[id] = `${reason} Source: OIIS candidate ${String(row.evidence_run_id ?? "nearest point-in-time snapshot")}, available ${availableAt?.toISOString()}.`;
  };
  set("C01", ratingFromPercent(row.evidence_data_quality, x.instrument_quality), `Entry plan, source bar and data-quality evidence scored ${Number(row.evidence_data_quality).toFixed(2)}%.`);
  set("C02", ratingFromPercent(o.market_regime_support, x.market_sector_synchronisation), "NIFTY regime, volatility and market synchronisation available before entry.");
  set("C03", ratingFromPercent(o.relative_strength, o.sector_industry_support), "Stock relative strength and sector support reconstructed from the originating selection snapshot.");
  set("C04", ratingFromPercent(x.setup_integrity, x.trigger_confirmation, o.trend_quality, o.momentum_quality), `Setup ${String(xfactor.setup_id ?? "state")} with RSI ${String(row.evidence_rsi14 ?? "—")}, Williams %R ${String(row.evidence_willr14 ?? "—")} and ATR ${String(row.evidence_atr14 ?? "—")}.`);
  set("C05", ratingFromPercent(x.entry_location_quality, x.timing_session_quality), `Entry location versus trigger/VWAP/no-chase evidence; reference ${String(row.evidence_reference_price ?? "—")}, no-chase ${String(row.evidence_no_chase_price ?? "—")}.`);
  set("C06", ratingFromPercent(x.liquidity_slippage_quality, o.liquidity_tradability), `Liquidity and tradability evidence; volume ratio ${String(row.evidence_volume_ratio ?? "—")}.`);
  set("C07", ratingFromPercent(x.reward_path_quality), `Reward-path evidence; governed reward/risk ${xfactor.reward_risk == null ? "used an explicitly conservative incomplete-path rating" : Number(xfactor.reward_risk).toFixed(2)}.`);
  set("C08", ratingFromPercent(x.stop_invalidation_quality), `Structural invalidation ${xfactor.structural_stop == null ? "was not recorded" : `at ${xfactor.structural_stop}`}; risk/share ${xfactor.risk_per_share ?? "—"}.`);

  const quantity = finite(row.opened_quantity) ?? 0;
  const entry = finite(row.average_entry_price) ?? 0;
  const atr = finite(row.evidence_atr14);
  const structuralRisk = finite(xfactor.risk_per_share);
  const riskPerShare = structuralRisk && structuralRisk > 0 ? structuralRisk : atr && atr > 0 ? atr : entry > 0 ? entry * 0.01 : null;
  const effectiveRisk = riskPerShare && quantity > 0 ? riskPerShare * quantity : null;
  const equity = finite(row.account_opening_cash);
  const riskShare = effectiveRisk && equity && equity > 0 ? effectiveRisk / equity : null;
  const sizingRating = riskShare == null ? (String((row.metadata as any)?.sizing_policy ?? "").includes("FNO_LOT") ? 4 : 3) : riskShare <= 0.005 ? 5 : riskShare <= 0.01 ? 4 : riskShare <= 0.02 ? 3 : riskShare <= 0.03 ? 2 : riskShare <= 0.05 ? 1 : 0;
  set("C09", sizingRating, `Estimated initial risk ${effectiveRisk == null ? "—" : `₹${effectiveRisk.toFixed(2)}`} (${riskShare == null ? "unknown" : `${(riskShare * 100).toFixed(2)}%`} of opening account equity); ${String((row.metadata as any)?.sizing_policy ?? "paper sizing")}.`);
  set("C10", ratingFromPercent(o.catalyst_context), "Catalyst/event context from the originating point-in-time OIIS evidence; neutral evidence is scored at the policy midpoint.");

  if (pointInTimeSafe && riskPerShare == null) hardFailFlags.push("C_H01");
  if (pointInTimeSafe && xfactor.reward_risk == null && finite(x.reward_path_quality) == null) hardFailFlags.push("C_H06");
  if (riskShare != null && riskShare > 0.01) hardFailFlags.push("C_H02");
  if (row.observation_status === "DATA_INCOMPLETE" || String(row.evidence_data_permission).toUpperCase() === "BLOCKED" || Number(row.evidence_data_quality) < 70) hardFailFlags.push("C_H09");

  const operatorOverride = object(row.metadata).operator_override === true;
  ratings.C16 = operatorOverride ? 2 : 4.5;
  reasons.C16 = operatorOverride ? "Operator override was recorded; adherence requires review." : "System record shows no operator override; execution followed the versioned PAPER workflow.";
  ratings.C17 = riskShare == null ? 3 : riskShare <= 0.005 ? 5 : riskShare <= 0.01 ? 4 : riskShare <= 0.02 ? 3 : riskShare <= 0.03 ? 2 : 1;
  reasons.C17 = `Portfolio interaction estimated from initial trade risk versus opening account equity (${riskShare == null ? "coverage unavailable" : `${(riskShare * 100).toFixed(2)}%`}).`;

  const charges = (finite(row.charges_total) ?? 0) + (finite(row.fill_friction_total) ?? 0);
  const costDragR = effectiveRisk && effectiveRisk > 0 ? charges / effectiveRisk : null;
  const openedMs = openedAt?.getTime();
  const lastMarkMs = row.last_mark_at ? new Date(String(row.last_mark_at)).getTime() : Number.NaN;
  const end = row.closed_at ? new Date(String(row.closed_at)).getTime() : Number.isFinite(lastMarkMs) ? lastMarkMs : Date.now();
  const holdingDays = openedMs && Number.isFinite(end) ? Math.max(0, (end - openedMs) / 86_400_000) : null;
  return { ratings, reasons, hardFailFlags, effectiveRisk, costDragR, drawdownBudgetShare: riskShare, holdingEfficiencyRatio: holdingDays == null ? null : Math.min(1, holdingDays / 5) };
}

export function projectStoredTradeQuality(row: Record<string, unknown>) {
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : {};
  const evidence = metadata.quality_evidence && typeof metadata.quality_evidence === "object" ? metadata.quality_evidence as Record<string, unknown> : {};
  const ratings = evidence.ratings && typeof evidence.ratings === "object" ? evidence.ratings as Record<string, number> : {};
  const reviewRatings = row.review_ratings && typeof row.review_ratings === "object" ? row.review_ratings as Record<string, number> : {};
  const entryEvidenceConfirmed = row.review_entry_evidence_confirmed === true;
  const automatic = String(row.asset_class).toUpperCase() === "OPTION" ? null : automaticCashEvidence(row);
  const processRatings = { ...(automatic?.ratings ?? {}), ...ratings, ...(entryEvidenceConfirmed ? reviewRatings : {}) };
  const outcomeRatings = { ...(automatic?.ratings ?? {}), ...ratings, ...reviewRatings };
  const opened = Number(row.opened_quantity ?? 0);
  const entry = Number(row.average_entry_price ?? 0);
  let effectiveRisk = finite(evidence.effective_risk_rupees ?? automatic?.effectiveRisk);
  const mae = finite(row.mae_5d_pct);
  const mfe = finite(row.mfe_5d_pct);
  const entryNotional = opened > 0 && entry > 0 ? opened * entry : null;
  if ((!effectiveRisk || effectiveRisk <= 0) && entryNotional != null && finite(evidence.initial_stop_pct) != null) {
    effectiveRisk = entryNotional * Number(evidence.initial_stop_pct) / 100;
  }
  const maeR = effectiveRisk && entryNotional != null && mae != null ? entryNotional * Math.abs(mae / 100) / effectiveRisk : null;
  const mfeR = effectiveRisk && entryNotional != null && mfe != null ? entryNotional * Math.max(0, mfe / 100) / effectiveRisk : null;
  const realisedPnl = finite(row.realised_net_pnl ?? row.actual_pnl) ?? 0;
  const remaining = finite(row.remaining_quantity) ?? 0;
  const charges = (finite(row.charges_total) ?? 0) + (finite(row.fill_friction_total) ?? 0);
  const actualPnl = remaining > 0 ? realisedPnl + (finite(row.unrealised_pnl) ?? 0) - charges : realisedPnl;
  const capture = entryNotional != null && mfe != null && mfe > 0 ? Math.max(0, actualPnl) / (entryNotional * mfe / 100) : null;
  return scoreTradeQuality({
    assetClass: String(row.asset_class).toUpperCase() === "OPTION" ? "OPTION" : "EQUITY",
    status: Number(row.remaining_quantity ?? 0) > 0 ? "OPEN" : "CLOSED",
    processRatings,
    outcomeRatings,
    processEvidenceReasons: automatic?.reasons,
    outcomeEvidenceReasons: automatic?.reasons,
    hardFailFlags: [...new Set([
      ...(automatic?.hardFailFlags ?? []),
      ...(Array.isArray(evidence.hard_fail_flags) ? evidence.hard_fail_flags.map(String) : []),
      ...(Array.isArray(row.review_hard_fail_flags) ? row.review_hard_fail_flags.map(String) : [])
    ])],
    dataInvalid: row.observation_status === "DATA_INCOMPLETE" || evidence.data_valid === false,
    effectiveRisk,
    afterTaxPnl: actualPnl,
    realisedPnl: actualPnl,
    maeR,
    mfeR,
    exitCaptureRatio: capture,
    drawdownBudgetShare: finite(evidence.drawdown_budget_share ?? automatic?.drawdownBudgetShare),
    costDragR: finite(evidence.cost_drag_r ?? automatic?.costDragR),
    holdingEfficiencyRatio: finite(evidence.holding_efficiency_ratio ?? automatic?.holdingEfficiencyRatio)
  });
}
