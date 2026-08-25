import type { Express } from "express";
import type { PrismaClient } from "@prisma/client";
import { estimateTradingCharges } from "./longOptions";

type Row = Record<string, any>;

export const NIFTY_WEEKLY_POLICY = {
  policyId: "NIFTY_WEEKLY_LONG_OPTIONS",
  version: "1.0.0",
  environment: "PAPER_RESEARCH",
  underlying: "NIFTY",
  maximumSnapshotAgeSeconds: 60,
  maximumCombinedSpreadPct: 0.04,
  straddleForecastImpliedMinimum: 1.15,
  strangleForecastImpliedMinimum: 1.3,
  targetNetAfterChargesInr: 1000,
  maximumPremiumRiskInr: 100000,
  liveOrdersEnabled: false,
} as const;

function number(input: unknown): number | null {
  if (input == null || input === "") return null;
  const parsed = Number(input);
  return Number.isFinite(parsed) ? parsed : null;
}

function iso(input: unknown) {
  if (!input) return null;
  const parsed = new Date(String(input));
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function dateOnly(input: unknown): string | null {
  if (!input) return null;
  const parsed = input instanceof Date ? input : new Date(String(input));
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : null;
}

function sampleStdDev(values: number[]) {
  if (values.length < 2) return null;
  const mean = values.reduce((sum, item) => sum + item, 0) / values.length;
  return Math.sqrt(values.reduce((sum, item) => sum + (item - mean) ** 2, 0) / (values.length - 1));
}

function chooseNearest(legs: Row[], optionType: "CE" | "PE", targetDelta: number) {
  return legs
    .filter((leg) => leg.option_type === optionType && number(leg.delta) != null)
    .sort((left, right) => Math.abs(Math.abs(number(left.delta)!) - targetDelta) - Math.abs(Math.abs(number(right.delta)!) - targetDelta))[0] ?? null;
}

function sumField(rows: Row[], field: string): { value: number | null; coverage: number } {
  const values = rows.map((row) => number(row[field])).filter((value): value is number => value != null);
  return { value: values.length ? values.reduce((sum, value) => sum + value, 0) : null, coverage: values.length };
}

function maxOiLeg(rows: Row[]) {
  return rows
    .filter((row) => number(row.open_interest) != null)
    .sort((left, right) => number(right.open_interest)! - number(left.open_interest)! || number(left.strike)! - number(right.strike)!)[0] ?? null;
}

export function buildNiftyOiAnalytics(args: {
  legs: Row[];
  previousLegs?: Row[];
  capturedAt: unknown;
  previousCapturedAt?: unknown;
}) {
  const calls = args.legs.filter((leg) => leg.option_type === "CE");
  const puts = args.legs.filter((leg) => leg.option_type === "PE");
  const previousCalls = (args.previousLegs ?? []).filter((leg) => leg.option_type === "CE");
  const previousPuts = (args.previousLegs ?? []).filter((leg) => leg.option_type === "PE");
  const ceOi = sumField(calls, "open_interest");
  const peOi = sumField(puts, "open_interest");
  const ceDayChange = sumField(calls, "change_in_oi");
  const peDayChange = sumField(puts, "change_in_oi");
  const previousCeOi = sumField(previousCalls, "open_interest");
  const previousPeOi = sumField(previousPuts, "open_interest");
  const pcr = ceOi.value != null && ceOi.value > 0 && peOi.value != null ? peOi.value / ceOi.value : null;
  const previousPcr = previousCeOi.value != null && previousCeOi.value > 0 && previousPeOi.value != null ? previousPeOi.value / previousCeOi.value : null;
  const callWall = maxOiLeg(calls);
  const putWall = maxOiLeg(puts);
  const currentMs = new Date(String(args.capturedAt)).getTime();
  const previousMs = args.previousCapturedAt ? new Date(String(args.previousCapturedAt)).getTime() : Number.NaN;
  return {
    scope: "PERSISTED_ATM_WINDOW",
    interpretation: pcr == null ? "UNAVAILABLE" : pcr > 1.05 ? "PUT_OI_DOMINANT" : pcr < 0.95 ? "CALL_OI_DOMINANT" : "BALANCED_OI",
    totals: {
      ceOi: ceOi.value,
      peOi: peOi.value,
      pcr,
      ceDayChange: ceDayChange.value,
      peDayChange: peDayChange.value,
      netDayChange: ceDayChange.value != null && peDayChange.value != null ? peDayChange.value - ceDayChange.value : null,
    },
    coverage: {
      callLegs: calls.length,
      putLegs: puts.length,
      callOiPresent: ceOi.coverage,
      putOiPresent: peOi.coverage,
      callChangeOiPresent: ceDayChange.coverage,
      putChangeOiPresent: peDayChange.coverage,
    },
    walls: {
      call: callWall ? { strike: number(callWall.strike), oi: number(callWall.open_interest), dayChange: number(callWall.change_in_oi) } : null,
      put: putWall ? { strike: number(putWall.strike), oi: number(putWall.open_interest), dayChange: number(putWall.change_in_oi) } : null,
    },
    comparison: args.previousLegs?.length && Number.isFinite(currentMs) && Number.isFinite(previousMs) ? {
      requestedMinutes: 10,
      previousCapturedAt: iso(args.previousCapturedAt),
      actualMinutes: (currentMs - previousMs) / 60_000,
      ceOiChange: ceOi.value != null && previousCeOi.value != null ? ceOi.value - previousCeOi.value : null,
      peOiChange: peOi.value != null && previousPeOi.value != null ? peOi.value - previousPeOi.value : null,
      pcrChange: pcr != null && previousPcr != null ? pcr - previousPcr : null,
    } : null,
    dataAsOf: iso(args.capturedAt),
    source: "NSE_OPTION_CHAIN_WATCHER",
    limitation: "OI totals and walls cover only the persisted ATM plus/minus strike window, not the complete exchange chain. OI concentration is context, not a directional order signal.",
  };
}

export function buildNiftyWeeklyStructure(args: {
  structureType: "BUY_ATM_STRADDLE" | "BUY_30_DELTA_STRANGLE";
  call: Row | null;
  put: Row | null;
  spot: number;
  lotSize: number;
  snapshotAgeSeconds: number;
  sessionPhase: string;
  expectedMovePoints: number | null;
}) {
  const { structureType, call, put, spot, lotSize, snapshotAgeSeconds, sessionPhase, expectedMovePoints } = args;
  const callBid = number(call?.bid_price);
  const callAsk = number(call?.ask_price);
  const putBid = number(put?.bid_price);
  const putAsk = number(put?.ask_price);
  const combinedAsk = callAsk != null && putAsk != null ? callAsk + putAsk : null;
  const combinedBid = callBid != null && putBid != null ? callBid + putBid : null;
  const spreadPct = combinedAsk && combinedBid != null ? (combinedAsk - combinedBid) / combinedAsk : null;
  const premiumRisk = combinedAsk != null ? combinedAsk * lotSize : null;
  const forecastImpliedRatio = combinedAsk && expectedMovePoints != null ? expectedMovePoints / combinedAsk : null;
  const minimumRatio = structureType === "BUY_ATM_STRADDLE" ? NIFTY_WEEKLY_POLICY.straddleForecastImpliedMinimum : NIFTY_WEEKLY_POLICY.strangleForecastImpliedMinimum;
  const hardGateFailures: string[] = [];
  if (!call || !put) hardGateFailures.push("REQUIRED_LEGS_MISSING");
  if (callBid == null || callAsk == null || putBid == null || putAsk == null || callBid <= 0 || putBid <= 0 || callAsk < callBid || putAsk < putBid) hardGateFailures.push("TWO_SIDED_MARKET_INVALID");
  if (snapshotAgeSeconds > NIFTY_WEEKLY_POLICY.maximumSnapshotAgeSeconds) hardGateFailures.push("CHAIN_STALE");
  if (sessionPhase !== "REGULAR") hardGateFailures.push("MARKET_NOT_REGULAR");
  if (spreadPct == null || spreadPct > NIFTY_WEEKLY_POLICY.maximumCombinedSpreadPct) hardGateFailures.push("SPREAD_VETO");
  if (premiumRisk == null || premiumRisk > NIFTY_WEEKLY_POLICY.maximumPremiumRiskInr) hardGateFailures.push("PREMIUM_RISK_LIMIT");
  if (forecastImpliedRatio == null || forecastImpliedRatio < minimumRatio) hardGateFailures.push("FORECAST_IMPLIED_RATIO_FAIL");
  // No calibrated target-hit model exists for this new weekly strategy yet.
  // This veto prevents a descriptive volatility proxy becoming a paper entry.
  hardGateFailures.push("TARGET_PROBABILITY_NOT_CALIBRATED");

  let targetCombinedBid: number | null = null;
  let targetCharges: ReturnType<typeof estimateTradingCharges> | null = null;
  if (combinedAsk != null && lotSize > 0) {
    targetCombinedBid = combinedAsk + NIFTY_WEEKLY_POLICY.targetNetAfterChargesInr / lotSize;
    for (let iteration = 0; iteration < 3; iteration += 1) {
      targetCharges = estimateTradingCharges(combinedAsk * lotSize, targetCombinedBid * lotSize, 4);
      targetCombinedBid = combinedAsk + (NIFTY_WEEKLY_POLICY.targetNetAfterChargesInr + targetCharges.total) / lotSize;
    }
  }
  const callStrike = number(call?.strike);
  const putStrike = number(put?.strike);
  return {
    structureType,
    state: "SHADOW_NO_TRADE",
    decision: "NO_TRADE",
    call: call ? { strike: callStrike, bid: callBid, ask: callAsk, iv: number(call.implied_volatility), delta: number(call.delta), volume: number(call.total_traded_volume), oi: number(call.open_interest) } : null,
    put: put ? { strike: putStrike, bid: putBid, ask: putAsk, iv: number(put.implied_volatility), delta: number(put.delta), volume: number(put.total_traded_volume), oi: number(put.open_interest) } : null,
    combinedAsk,
    combinedBid,
    combinedSpreadPct: spreadPct,
    premiumRiskInr: premiumRisk,
    impliedMovePoints: combinedAsk,
    impliedMovePct: combinedAsk != null ? combinedAsk / spot : null,
    expectedMovePoints,
    forecastImpliedRatio,
    lowerBreakeven: putStrike != null && combinedAsk != null ? putStrike - combinedAsk : null,
    upperBreakeven: callStrike != null && combinedAsk != null ? callStrike + combinedAsk : null,
    targetCombinedBid,
    estimatedTargetRoundTripCharges: targetCharges,
    hardGateFailures,
    safety: { openingSide: "BUY", closingSide: "SELL", liveOrdersEnabled: false },
  };
}

async function resolveExpiryRegistry(prisma: PrismaClient) {
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT expiry::date expiry_date, lotsize, count(*)::int contract_count
       FROM public.instruments
      WHERE exchange='NFO' AND name='NIFTY' AND instrumenttype='OPTIDX'
        AND expiry >= (now() AT TIME ZONE 'Asia/Kolkata')::date
      GROUP BY expiry,lotsize ORDER BY expiry`,
  );
  const dates = [...new Set(rows.map((row) => dateOnly(row.expiry_date)).filter((date): date is string => Boolean(date)))];
  const w0 = dates[0] ?? null;
  const monthPrefix = w0?.slice(0, 7) ?? null;
  const m0 = monthPrefix ? dates.filter((date) => date.startsWith(monthPrefix)).at(-1) ?? w0 : null;
  return {
    W0: w0,
    M0: m0,
    alsoNearestWeekly: Boolean(w0 && m0 && w0 === m0),
    rows: rows.map((row) => ({ expiryDate: dateOnly(row.expiry_date), lotSize: Number(row.lotsize), contractCount: Number(row.contract_count) })),
  };
}

async function loadNiftyExpiry(prisma: PrismaClient, expiryRole: "W0" | "M0", registry: Awaited<ReturnType<typeof resolveExpiryRegistry>>) {
  const expiryDate = registry[expiryRole];
  const [snapshot] = expiryDate ? await prisma.$queryRawUnsafe<Row[]>(
    `SELECT s.* FROM public.option_chain_snapshots s
      WHERE s.symbol='NIFTY' AND s.expiry_date=$1::date
      ORDER BY s.captured_at DESC LIMIT 1`,
    expiryDate,
  ) : [];
  if (!snapshot) return {
    expiryRole,
    expiryDate,
    alsoNearestWeekly: registry.alsoNearestWeekly,
    generatedAt: new Date().toISOString(),
    state: "NO_DATA",
    snapshot: null,
    structures: [],
    strikeLadder: [],
    hardGateFailures: [expiryDate ? `${expiryRole}_CHAIN_NOT_CAPTURED` : `${expiryRole}_CONTRACT_MISSING`],
  };

  const [legs, lotRows, dailyRows, sessionRows] = await Promise.all([
    prisma.$queryRawUnsafe<Row[]>(`SELECT * FROM public.option_chain_legs WHERE snapshot_id=$1::bigint ORDER BY strike,option_type`, snapshot.id),
    prisma.$queryRawUnsafe<Row[]>(`SELECT lotsize,count(*) contract_count FROM public.instruments WHERE exchange='NFO' AND name='NIFTY' AND instrumenttype='OPTIDX' AND expiry=$1::date GROUP BY lotsize ORDER BY count(*) DESC LIMIT 1`, snapshot.expiry_date),
    prisma.$queryRawUnsafe<Row[]>(`SELECT trade_date,close FROM public.bars_1d WHERE exchange='NSE' AND symbol_token='99926000' ORDER BY trade_date DESC LIMIT 31`),
    prisma.$queryRawUnsafe<Row[]>(`SELECT trade_date,market_open_ts,market_close_ts,is_trading_day FROM public.trading_calendar WHERE trade_date BETWEEN (now() AT TIME ZONE 'Asia/Kolkata')::date AND $1::date ORDER BY trade_date`, snapshot.expiry_date),
  ]);
  const [previousSnapshot] = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT s.*
       FROM public.option_chain_snapshots s
       JOIN public.trading_calendar c
         ON c.trade_date=(s.captured_at AT TIME ZONE 'Asia/Kolkata')::date
      WHERE s.symbol='NIFTY'
        AND s.expiry_date=$1::date
        AND (s.captured_at AT TIME ZONE 'Asia/Kolkata')::date=($2::timestamptz AT TIME ZONE 'Asia/Kolkata')::date
        AND s.captured_at <= $2::timestamptz - interval '10 minutes'
        AND c.is_trading_day IS TRUE
        AND s.captured_at BETWEEN c.market_open_ts AND c.market_close_ts
      ORDER BY s.captured_at DESC LIMIT 1`,
    snapshot.expiry_date,
    snapshot.captured_at,
  );
  const previousLegs = previousSnapshot
    ? await prisma.$queryRawUnsafe<Row[]>(`SELECT * FROM public.option_chain_legs WHERE snapshot_id=$1::bigint ORDER BY strike,option_type`, previousSnapshot.id)
    : [];

  const now = Date.now();
  const capturedAt = new Date(snapshot.captured_at).getTime();
  const snapshotAgeSeconds = Math.max(0, Math.floor((now - capturedAt) / 1000));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const todaySession = sessionRows.find((row) => String(row.trade_date).slice(0, 10) === today);
  const openMs = todaySession?.market_open_ts ? new Date(todaySession.market_open_ts).getTime() : null;
  const closeMs = todaySession?.market_close_ts ? new Date(todaySession.market_close_ts).getTime() : null;
  const sessionPhase = !todaySession?.is_trading_day ? "CLOSED" : openMs != null && now < openMs ? "PREOPEN" : closeMs != null && now > closeMs ? "CLOSED" : "REGULAR";
  const sessionsRemaining = sessionRows.filter((row) => row.is_trading_day && new Date(row.market_close_ts).getTime() > now).length;
  const closes = dailyRows.map((row) => number(row.close)).filter((item): item is number => item != null).reverse();
  const returns = closes.slice(1).map((close, index) => Math.log(close / closes[index]!));
  const dailyVolatility = sampleStdDev(returns);
  const spot = number(snapshot.underlying_value) ?? 0;
  const expectedMovePoints = dailyVolatility != null ? spot * dailyVolatility * Math.sqrt(Math.max(sessionsRemaining, 1)) : null;
  const lotSize = Number(lotRows[0]?.lotsize ?? 0);
  const atmStrike = number(snapshot.atm_strike) ?? spot;
  const atmCall = legs.find((leg) => leg.option_type === "CE" && number(leg.strike) === atmStrike) ?? null;
  const atmPut = legs.find((leg) => leg.option_type === "PE" && number(leg.strike) === atmStrike) ?? null;
  const deltaCall = chooseNearest(legs, "CE", 0.3);
  const deltaPut = chooseNearest(legs, "PE", 0.3);
  const structures = [
    buildNiftyWeeklyStructure({ structureType: "BUY_ATM_STRADDLE", call: atmCall, put: atmPut, spot, lotSize, snapshotAgeSeconds, sessionPhase, expectedMovePoints }),
    buildNiftyWeeklyStructure({ structureType: "BUY_30_DELTA_STRANGLE", call: deltaCall, put: deltaPut, spot, lotSize, snapshotAgeSeconds, sessionPhase, expectedMovePoints }),
  ];
  const strikeLadder = [...new Set(legs.map((leg) => number(leg.strike)).filter((item): item is number => item != null))]
    .sort((left, right) => left - right)
    .map((strike) => {
      const call = legs.find((leg) => leg.option_type === "CE" && number(leg.strike) === strike);
      const put = legs.find((leg) => leg.option_type === "PE" && number(leg.strike) === strike);
      return {
        strike,
        atm: strike === atmStrike,
        call: call ? { bid: number(call.bid_price), ask: number(call.ask_price), iv: number(call.implied_volatility), delta: number(call.delta), volume: number(call.total_traded_volume), oi: number(call.open_interest), changeOi: number(call.change_in_oi) } : null,
        put: put ? { bid: number(put.bid_price), ask: number(put.ask_price), iv: number(put.implied_volatility), delta: number(put.delta), volume: number(put.total_traded_volume), oi: number(put.open_interest), changeOi: number(put.change_in_oi) } : null,
      };
    });
  return {
    expiryRole,
    expiryDate,
    alsoNearestWeekly: registry.alsoNearestWeekly,
    strategyFamily: NIFTY_WEEKLY_POLICY.policyId,
    strategyVersion: NIFTY_WEEKLY_POLICY.version,
    environment: NIFTY_WEEKLY_POLICY.environment,
    generatedAt: new Date().toISOString(),
    state: structures.some((structure) => structure.decision === "READY") ? "READY" : "NO_TRADE",
    liveOrdersEnabled: false,
    policy: NIFTY_WEEKLY_POLICY,
    snapshot: { id: String(snapshot.id), capturedAt: iso(snapshot.captured_at), source: snapshot.source, expiryDate: dateOnly(snapshot.expiry_date), spot, atmStrike, snapshotAgeSeconds, sessionPhase, sessionsRemaining, strikeCount: new Set(legs.map((leg) => String(leg.strike))).size, twoSidedLegCount: legs.filter((leg) => number(leg.bid_price)! > 0 && number(leg.ask_price)! > 0).length, totalLegCount: legs.length, lotSize },
    movementModel: { method: "20_SESSION_LOG_RETURN_VOLATILITY_SQRT_REMAINING_SESSIONS", sampleSessions: returns.length, dailyVolatility, expectedMovePoints },
    oiAnalytics: buildNiftyOiAnalytics({ legs, previousLegs, capturedAt: snapshot.captured_at, previousCapturedAt: previousSnapshot?.captured_at }),
    structures,
    strikeLadder,
    provenance: { chain: "public.option_chain_snapshots + public.option_chain_legs", oi: "NSE option-chain watcher: open_interest + change_in_oi with in-session 10-minute comparison", contracts: "public.instruments", movement: "public.bars_1d NSE index token 99926000", calendar: "public.trading_calendar", note: `Independent NIFTY ${expiryRole === "W0" ? "weekly" : "monthly"} long-premium research surface; no OIIS, Rolling Monthly, stock Long Options or paper-trade write path.` },
  };
}

async function loadNiftyOptions(prisma: PrismaClient) {
  const registry = await resolveExpiryRegistry(prisma);
  const [weekly, monthly, historyRows] = await Promise.all([
    loadNiftyExpiry(prisma, "W0", registry),
    registry.alsoNearestWeekly ? Promise.resolve(null) : loadNiftyExpiry(prisma, "M0", registry),
    prisma.$queryRawUnsafe<Row[]>(
      `SELECT count(*)::int snapshot_count,
              count(distinct expiry_date)::int expiry_cycles,
              min(captured_at) first_captured_at,
              max(captured_at) last_captured_at
         FROM public.option_chain_snapshots WHERE symbol='NIFTY'`,
    ),
  ]);
  const monthlySurface = registry.alsoNearestWeekly ? { ...weekly, expiryRole: "M0", alsoNearestWeekly: true } : monthly;
  const surfaces = [weekly, monthlySurface].filter(Boolean) as Row[];
  const captured = surfaces.filter((surface) => surface.snapshot);
  const history = historyRows[0] ?? {};
  return {
    strategyFamily: "NIFTY_WEEKLY_MONTHLY_LONG_OPTIONS",
    strategyVersion: "1.0.0",
    environment: "SHADOW_NO_TRADE",
    generatedAt: new Date().toISOString(),
    state: captured.length === surfaces.length ? "NO_TRADE" : captured.length ? "INCOMPLETE" : "NO_DATA",
    liveOrdersEnabled: false,
    paperSubmissionEnabled: false,
    safety: {
      openingSide: "BUY",
      closingSide: "SELL_TO_CLOSE_ONLY",
      prohibited: ["OPENING_SELL", "OPTION_WRITING", "CREDIT_STRUCTURE", "LIVE_ORDER"],
    },
    expiryRegistry: {
      W0: registry.W0,
      M0: registry.M0,
      alsoNearestWeekly: registry.alsoNearestWeekly,
      contracts: registry.rows,
    },
    weekly,
    monthly: monthlySurface,
    scorecard: {
      calibrationStatus: "NOT_CALIBRATED",
      DQS: null, MRS: null, LCS: null, DES: null, VES: null, CQS: null, ECS: null, TFS: null, FRS: null,
      reason: "The supplied score framework has not yet been fitted and calibrated against sufficient point-in-time weekly and monthly option history. Scores remain unavailable rather than being fabricated.",
    },
    paperBook: {
      state: "NOT_CONNECTED",
      groups: [],
      message: "Paper submission remains disabled until replay and forward-validation promotion gates pass.",
    },
    validation: {
      state: "INSUFFICIENT_HISTORY",
      snapshotCount: Number(history.snapshot_count ?? 0),
      expiryCycles: Number(history.expiry_cycles ?? 0),
      firstCapturedAt: iso(history.first_captured_at),
      lastCapturedAt: iso(history.last_captured_at),
      minimumForwardPaperSessions: 60,
      minimumWeeklyCycles: 12,
      minimumMonthlyCycles: 6,
      minimumEvaluatedStructures: 500,
    },
    sources: [
      { id: "NSE_WATCHER", role: "Canonical focused W0/M0 chain analytics", status: captured.length ? "AVAILABLE" : "NO_DATA", dataAsOf: captured.map((item) => item.snapshot?.capturedAt).filter(Boolean).sort().at(-1) ?? null },
      { id: "SMARTAPI_INSTRUMENT_MASTER", role: "Contract identity, expiry and lot size", status: registry.rows.length ? "AVAILABLE" : "NO_DATA", dataAsOf: null },
      { id: "SMARTAPI_EXECUTION_EVIDENCE", role: "Selected-leg quote/depth revalidation", status: "NOT_WIRED_FOR_ENTRY", dataAsOf: null },
      { id: "NIFTY_BARS", role: "Realised movement proxy", status: "AVAILABLE", dataAsOf: null },
    ],
  };
}

export function registerNiftyWeeklyOptions(app: Express, prisma: PrismaClient) {
  app.get("/v1/nifty-weekly-options/summary", async (_req, res, next) => {
    try {
      const registry = await resolveExpiryRegistry(prisma);
      res.json(await loadNiftyExpiry(prisma, "W0", registry));
    } catch (error) { next(error); }
  });
  app.get("/v1/nifty-options/summary", async (_req, res, next) => {
    try { res.json(await loadNiftyOptions(prisma)); } catch (error) { next(error); }
  });
  app.get("/v1/nifty-options/expiries", async (_req, res, next) => {
    try { res.json(await resolveExpiryRegistry(prisma)); } catch (error) { next(error); }
  });
}
