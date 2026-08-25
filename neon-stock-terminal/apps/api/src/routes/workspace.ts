import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Express } from "express";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { RequestAuthenticator } from "../auth/guard";
import { runWithConcurrency } from "../lib/boundedConcurrency";
import { projectStoredTradeQuality, TRADE_QUALITY_POLICY } from "../lib/tradeQuality";
import { paperCapitalStrategyComparisons } from "../lib/paperCapitalSimulation";

type Row = Record<string, unknown>;

const FIXED_CASH_INVESTMENT = 200_000;

function finiteNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalPositiveNumber(value: unknown) {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function horizonOutcomePnl(horizon: Row | undefined, entryNotional: number) {
  if (!horizon) return null;
  if (horizon.after_tax_pnl != null) return finiteNumber(horizon.after_tax_pnl);
  if (horizon.after_cost_pnl != null) return finiteNumber(horizon.after_cost_pnl);
  if (horizon.closing_return != null) return entryNotional * finiteNumber(horizon.closing_return);
  return null;
}

export function futuresWorkspacePayload(contracts: Row[], participantRows: Row[]) {
  const jsonSafeContracts = contracts.map((row) => ({
    ...row,
    // PostgreSQL window functions are bigint by default. Keep the public
    // contract numeric while preventing Express JSON serialization failures.
    expiry_rank: row.expiry_rank == null ? null : finiteNumber(row.expiry_rank)
  }));
  return { contracts: jsonSafeContracts, participantRows, rows: participantRows };
}

export function paperTradeProjection(row: Row) {
  const targets = Array.isArray(row.targets) ? row.targets as Row[] : [];
  const entryStrategy = String((row.metadata as Row | undefined)?.entry_rule ?? "UNSPECIFIED");
  const horizons = Array.isArray(row.horizons) ? row.horizons as Row[] : [];
  const five = horizons.find((item) => finiteNumber(item.horizon_sessions) === 5);
  const thirty = horizons.find((item) => finiteNumber(item.horizon_sessions) === 30);
  const fiveMature = five?.status === "COMPLETED";
  const mfeRatio = finiteNumber(five?.mfe ?? row.mfe);
  const maeRatio = finiteNumber(five?.mae ?? row.mae);
  const mfePct = mfeRatio * 100;
  const maePct = maeRatio * 100;
  const dataIncomplete = row.observation_status === "DATA_INCOMPLETE" || five?.status === "DATA_INCOMPLETE";
  const grade = dataIncomplete
    ? "DATA_INCOMPLETE"
    : !fiveMature
      ? maePct <= -2 ? "AT_RISK" : "DEVELOPING"
      : mfePct >= 5 && maePct > -2
        ? "EXCELLENT"
        : mfePct >= 1 && maePct > -2
          ? "GOOD"
          : mfePct >= 1 && maePct <= -2
            ? "MIXED"
            : maePct <= -2 ? "BAD" : "WEAK";
  const firstIntradayHit = targets
    .filter((item) => item.lifecycle === "INTRADAY" && item.first_hit_at)
    .map((item) => new Date(String(item.first_hit_at)).getTime())
    .filter(Number.isFinite)
    .sort((a, b) => a - b)[0];
  const openedAtMs = row.opened_at ? new Date(String(row.opened_at)).getTime() : Number.NaN;
  const firstHitMinutes = Number.isFinite(firstIntradayHit) && Number.isFinite(openedAtMs)
    ? Math.max(0, Math.round((firstIntradayHit - openedAtMs) / 60_000))
    : null;
  const rewardComponent = Math.min(Math.max(mfePct, 0) / 5, 1) * 48;
  const riskComponent = Math.max(1 - Math.abs(Math.min(maePct, 0)) / 4, 0) * 34;
  const speedComponent = firstHitMinutes == null ? 0 : Math.max(1 - firstHitMinutes / 385, 0) * 18;
  const analyticalEvidenceScore = Math.round(rewardComponent + riskComponent + speedComponent);
  const entryNotional = finiteNumber(row.average_entry_price) * finiteNumber(row.opened_quantity);
  // realised_pnl is net of modelled costs/tax; unrealised_pnl is a gross mark.
  // Keep the legacy row total for compatibility, but expose each basis explicitly
  // so the UI never represents their sum as a like-for-like accounting total.
  const actualPnl = finiteNumber(row.realised_pnl) + finiteNumber(row.unrealised_pnl);
  const openedQuantity = finiteNumber(row.opened_quantity);
  const fnoLotSize = finiteNumber(row.fno_lot_size ?? row.snapshot_lot_size);
  const cachedCarryMark = row.carry_mark == null ? null : finiteNumber(row.carry_mark);
  const positionMark = row.last_mark == null ? null : finiteNumber(row.last_mark);
  const carryMark = cachedCarryMark != null && cachedCarryMark > 0
    ? cachedCarryMark
    : positionMark != null && positionMark > 0 ? positionMark : null;
  const entryPrice = finiteNumber(row.average_entry_price);
  // The paper fill is a cash-equity price while opened_quantity is the F&O-derived
  // quantity captured when the trade was opened. Keep that historical quantity
  // stable even if NSE changes the current lot size later.
  const fixedInvestmentQuantity = entryPrice > 0
    ? Math.floor(FIXED_CASH_INVESTMENT / entryPrice)
    : 0;
  const fixedInvestmentDeployed = fixedInvestmentQuantity * entryPrice;
  const fixedInvestmentCashRemaining = FIXED_CASH_INVESTMENT - fixedInvestmentDeployed;
  const carryPnl = carryMark != null && entryPrice > 0 && openedQuantity > 0
    ? (String(row.side).toUpperCase() === "SELL" ? entryPrice - carryMark : carryMark - entryPrice) * openedQuantity
    : null;
  const carryReturnPct = carryMark != null && entryPrice > 0
    ? (String(row.side).toUpperCase() === "SELL" ? 1 - carryMark / entryPrice : carryMark / entryPrice - 1) * 100
    : null;
  const intradayEodMark = row.intraday_eod_complete === true && row.intraday_eod_mark != null
    ? finiteNumber(row.intraday_eod_mark)
    : null;
  const intradayHigh = row.intraday_session_high == null ? null : finiteNumber(row.intraday_session_high);
  const intradayLow = row.intraday_session_low == null ? null : finiteNumber(row.intraday_session_low);
  const direction = String(row.side).toUpperCase() === "SELL" ? -1 : 1;
  const intradayEodPnl = intradayEodMark != null && entryPrice > 0 && openedQuantity > 0
    ? direction * (intradayEodMark - entryPrice) * openedQuantity
    : null;
  const intradayEodReturnPct = intradayEodMark != null && entryPrice > 0
    ? direction * (intradayEodMark / entryPrice - 1) * 100
    : null;
  const fixedInvestmentActualPnl = openedQuantity > 0
    ? actualPnl / openedQuantity * fixedInvestmentQuantity
    : null;
  const fixedInvestmentCarryPnl = carryMark != null && fixedInvestmentQuantity > 0
    ? direction * (carryMark - entryPrice) * fixedInvestmentQuantity
    : null;
  const fixedInvestmentIntradayEodPnl = intradayEodMark != null && fixedInvestmentQuantity > 0
    ? direction * (intradayEodMark - entryPrice) * fixedInvestmentQuantity
    : null;
  const intradayMaxProfit = intradayHigh != null && intradayLow != null && entryPrice > 0 && openedQuantity > 0
    ? Math.max(0, direction > 0 ? intradayHigh - entryPrice : entryPrice - intradayLow) * openedQuantity
    : null;
  const intradayMaxDrawdown = intradayHigh != null && intradayLow != null && entryPrice > 0 && openedQuantity > 0
    ? Math.min(0, direction > 0 ? intradayLow - entryPrice : entryPrice - intradayHigh) * openedQuantity
    : null;
  const fiveCompletedPnl = five?.status === "COMPLETED" ? horizonOutcomePnl(five, entryNotional) : null;
  const thirtyCompletedPnl = thirty?.status === "COMPLETED" ? horizonOutcomePnl(thirty, entryNotional) : null;
  // Both horizons begin at entry. Before D+5 maturity their snapshot values must be identical.
  // At D+5 the five-session value freezes while the inclusive D+30 path keeps marking forward.
  const fiveSnapshotPnl = fiveCompletedPnl ?? carryPnl;
  const thirtySnapshotPnl = thirtyCompletedPnl ?? carryPnl;
  const stopLossLimit = 6000;
  const stopLossHitAt = row.stop_loss_hit_at ?? null;
  const stopLossExitPrice = row.stop_loss_exit_price == null ? null : finiteNumber(row.stop_loss_exit_price);
  const stopLossScenarioPnl = stopLossHitAt && stopLossExitPrice != null
    ? direction * (stopLossExitPrice - entryPrice) * openedQuantity
    : thirtyCompletedPnl ?? carryPnl;
  const actualPnlPerUnit = openedQuantity > 0 ? actualPnl / openedQuantity : 0;
  const actualReturnPct = entryNotional > 0 ? actualPnl / entryNotional * 100 : null;
  const captureEfficiencyPct = actualReturnPct != null && mfePct > 0 ? actualReturnPct / mfePct * 100 : null;
  const executionOutcome = finiteNumber(row.remaining_quantity) > 0
    ? actualPnl > 0 ? "OPEN_PROFIT" : actualPnl < 0 ? "OPEN_LOSS" : "BREAKEVEN"
    : actualPnl > 0 ? "CLOSED_PROFIT" : actualPnl < 0 ? "CLOSED_LOSS" : "BREAKEVEN";
  const tradeDirection = direction < 0 ? "SHORT" : "LONG";
  const entryBookBestBid = optionalPositiveNumber(row.entry_book_best_bid_price);
  const entryBookBestAsk = optionalPositiveNumber(row.entry_book_best_ask_price);
  const entryBookReferenceTouch = tradeDirection === "SHORT" ? entryBookBestBid : entryBookBestAsk;
  const entryBookSpread = entryBookBestBid != null && entryBookBestAsk != null
    ? entryBookBestAsk - entryBookBestBid
    : null;
  const entryBookMid = entryBookBestBid != null && entryBookBestAsk != null
    ? (entryBookBestBid + entryBookBestAsk) / 2
    : null;
  const projected = {
    ...row,
    trade_direction: tradeDirection,
    entry_strategy: entryStrategy,
    targets,
    horizons,
    analytical_grade: grade,
    analytical_evidence_score: analyticalEvidenceScore,
    analytical_evidence_components: {
      reward: Number(rewardComponent.toFixed(2)),
      risk: Number(riskComponent.toFixed(2)),
      speed: Number(speedComponent.toFixed(2))
    },
    mature_5d: fiveMature,
    mfe_5d_pct: mfePct,
    mae_5d_pct: maePct,
    mfe_30d_pct: finiteNumber(thirty?.mfe ?? row.mfe) * 100,
    mae_30d_pct: finiteNumber(thirty?.mae ?? row.mae) * 100,
    first_intraday_hit_minutes: firstHitMinutes,
    entry_notional: entryNotional,
    investment_price_basis: entryPrice || null,
    investment_quantity_basis: openedQuantity || null,
    fno_quantity_investment_required: entryNotional || null,
    fixed_investment_budget: FIXED_CASH_INVESTMENT,
    fixed_investment_quantity: fixedInvestmentQuantity || null,
    fixed_investment_deployed: fixedInvestmentQuantity > 0 ? fixedInvestmentDeployed : null,
    fixed_investment_cash_remaining: fixedInvestmentQuantity > 0 ? fixedInvestmentCashRemaining : null,
    fixed_investment_actual_pnl: fixedInvestmentActualPnl,
    fixed_investment_carry_pnl: fixedInvestmentCarryPnl,
    fixed_investment_intraday_eod_pnl: fixedInvestmentIntradayEodPnl,
    fixed_investment_mfe_5d_pnl: fixedInvestmentDeployed * Math.max(0, mfePct) / 100,
    fixed_investment_mae_5d_pnl: fixedInvestmentDeployed * Math.min(0, maePct) / 100,
    fixed_investment_mfe_30d_pnl: fixedInvestmentDeployed * Math.max(0, finiteNumber(thirty?.mfe ?? row.mfe) * 100) / 100,
    fixed_investment_mae_30d_pnl: fixedInvestmentDeployed * Math.min(0, finiteNumber(thirty?.mae ?? row.mae) * 100) / 100,
    actual_pnl: actualPnl,
    realised_gross_pnl: finiteNumber(row.realised_gross_pnl),
    realised_net_pnl: finiteNumber(row.realised_pnl),
    open_unrealised_gross_pnl: finiteNumber(row.unrealised_pnl),
    gross_execution_mark: finiteNumber(row.realised_gross_pnl) + finiteNumber(row.unrealised_pnl),
    actual_pnl_total: actualPnl,
    actual_pnl_per_unit: actualPnlPerUnit,
    hypothetical_carry_mark: carryMark,
    hypothetical_carry_mark_at: cachedCarryMark != null && cachedCarryMark > 0 ? row.carry_mark_at : row.last_mark_at,
    hypothetical_carry_mark_source: cachedCarryMark != null && cachedCarryMark > 0 ? "SMARTAPI_QUOTE_CACHE" : carryMark != null ? "POSITION_MARK_FALLBACK" : null,
    hypothetical_carry_pnl: carryPnl,
    hypothetical_carry_return_pct: carryReturnPct,
    horizon_5d_snapshot_pnl: fiveSnapshotPnl,
    horizon_5d_snapshot_state: fiveCompletedPnl != null ? "FROZEN_AT_5D" : carryPnl != null ? "DEVELOPING" : "UNAVAILABLE",
    horizon_30d_snapshot_pnl: thirtySnapshotPnl,
    horizon_30d_snapshot_state: thirtyCompletedPnl != null ? "TIME_UP_30D" : carryPnl != null ? "DEVELOPING_INCLUSIVE" : "UNAVAILABLE",
    stop_loss_limit: stopLossLimit,
    stop_loss_price: row.stop_loss_price == null ? null : finiteNumber(row.stop_loss_price),
    stop_loss_hit: Boolean(stopLossHitAt),
    stop_loss_hit_at: stopLossHitAt,
    stop_loss_exit_price: stopLossExitPrice,
    stop_loss_scenario_pnl: stopLossScenarioPnl,
    stop_loss_scenario_state: stopLossHitAt ? "EXITED_AT_FIRST_BREACH" : thirtyCompletedPnl != null ? "NO_BREACH_30D_COMPLETE" : carryPnl != null ? "NO_BREACH_MARKED_CURRENT" : "UNAVAILABLE",
    intraday_eod_mark: intradayEodMark,
    intraday_eod_mark_at: intradayEodMark == null ? null : row.intraday_eod_mark_at,
    intraday_eod_mark_source: intradayEodMark == null ? null : "BARS_1M_ENTRY_SESSION_CLOSE",
    intraday_eod_pnl: intradayEodPnl,
    intraday_eod_return_pct: intradayEodReturnPct,
    intraday_max_profit: intradayMaxProfit,
    intraday_max_drawdown: intradayMaxDrawdown,
    intraday_bar_count: finiteNumber(row.intraday_bar_count),
    intraday_eod_complete: intradayEodMark != null,
    closed_in_intraday: row.closed_in_intraday === true,
    fno_lot_size: fnoLotSize || null,
    lot_count: fnoLotSize > 0 ? openedQuantity / fnoLotSize : null,
    quantity_matches_current_fno_lot: fnoLotSize > 0 ? openedQuantity === fnoLotSize : null,
    actual_return_pct: actualReturnPct,
    capture_efficiency_pct: captureEfficiencyPct,
    execution_outcome: executionOutcome,
    entry_book_best_bid_price: entryBookBestBid,
    entry_book_best_ask_price: entryBookBestAsk,
    entry_book_reference_touch: entryBookReferenceTouch,
    entry_book_reference_touch_side: tradeDirection === "SHORT" ? "BID" : "ASK",
    entry_book_spread: entryBookSpread,
    entry_book_spread_bps: entryBookSpread != null && entryBookMid != null && entryBookMid > 0
      ? entryBookSpread / entryBookMid * 10_000
      : null
  };
  const tradeQuality = projectStoredTradeQuality(projected);
  return {
    ...projected,
    trade_quality: tradeQuality,
    trade_quality_review: row.review_reviewed_at ? {
      ratings: row.review_ratings ?? {},
      hardFailFlags: row.review_hard_fail_flags ?? [],
      entryEvidenceConfirmed: row.review_entry_evidence_confirmed === true,
      evidenceNote: row.review_evidence_note ?? null,
      reviewerEmail: row.review_reviewer_email ?? null,
      reviewedAt: row.review_reviewed_at
    } : null,
    quality_score: tradeQuality.totalScore,
    quality_label: tradeQuality.label,
    quality_coverage_pct: Math.min(tradeQuality.process.coveragePct, tradeQuality.outcome.coveragePct)
  };
}

const TARGET_EXIT_SCENARIOS = [
  { id: "LOW", intraday: 0.003, swing: 0.01 },
  { id: "MEDIUM", intraday: 0.005, swing: 0.03 },
  { id: "HIGH", intraday: 0.01, swing: 0.05 }
] as const;

export function paperTargetExitScenarios(trades: Row[]) {
  return TARGET_EXIT_SCENARIOS.map((scenario) => {
    let realisedGross = 0;
    let unrealisedGross = 0;
    let realisedCount = 0;
    let openCount = 0;
    for (const trade of trades) {
      const targets = Array.isArray(trade.targets) ? trade.targets as Row[] : [];
      const candidates = targets.filter((target) => {
        const lifecycle = String(target.lifecycle);
        const threshold = finiteNumber(target.target_pct);
        const expected = lifecycle === "INTRADAY" ? scenario.intraday : lifecycle === "SWING" ? scenario.swing : -1;
        return Math.abs(threshold - expected) < 1e-9 && target.first_hit_at;
      }).sort((left, right) => new Date(String(left.first_hit_at)).getTime() - new Date(String(right.first_hit_at)).getTime());
      const firstHit = candidates[0];
      if (firstHit) {
        realisedGross += finiteNumber(firstHit.gross_pnl);
        realisedCount += 1;
      } else {
        const quantity = finiteNumber(trade.opened_quantity);
        const entry = finiteNumber(trade.average_entry_price);
        const mark = finiteNumber(trade.last_mark);
        const direction = String(trade.side).toUpperCase() === "SELL" ? -1 : 1;
        if (quantity > 0 && entry > 0 && mark > 0) unrealisedGross += direction * (mark - entry) * quantity;
        openCount += 1;
      }
    }
    return {
      id: scenario.id,
      intraday_target_pct: scenario.intraday * 100,
      swing_target_pct: scenario.swing * 100,
      realised_gross: realisedGross,
      unrealised_gross: unrealisedGross,
      combined_gross: realisedGross + unrealisedGross,
      realised_count: realisedCount,
      open_count: openCount
    };
  });
}

const manualPaperTradeSchema = z.object({
  assetClass: z.enum(["EQUITY", "OPTION"]),
  symbol: z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9&-]+$/),
  side: z.enum(["BUY", "SELL"]),
  quantity: z.coerce.number().positive().max(1_000_000).optional(),
  orderType: z.enum(["MARKET", "LIMIT"]),
  limitPrice: z.coerce.number().positive().max(10_000_000).optional(),
  initialStopPct: z.coerce.number().positive().max(20),
  maxHoldingSessions: z.coerce.number().int().positive().max(30),
  tradeReason: z.string().trim().min(10).max(500),
  notes: z.string().trim().max(500).optional().default("")
}).superRefine((value, context) => {
  if (value.orderType === "LIMIT" && value.limitPrice == null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["limitPrice"], message: "Limit price is required." });
  }
});

const paperTradeCommentSchema = z.object({
  body: z.string().trim().min(1, "Comment cannot be empty.").max(2000, "Comment must be 2,000 characters or fewer.")
});

const tradeQualityReviewSchema = z.object({
  ratings: z.record(z.string(), z.coerce.number().min(0).max(5)).default({}),
  hardFailFlags: z.array(z.string().trim().min(1).max(40)).max(32).default([]),
  entryEvidenceConfirmed: z.boolean().default(false),
  evidenceNote: z.string().trim().min(10, "Explain the evidence in at least 10 characters.").max(2000)
}).strict();

function paperServiceToken() {
  const direct = process.env.PAPER_API_SERVICE_TOKEN?.trim();
  if (direct) return direct;
  const file = process.env.PAPER_API_SERVICE_TOKEN_FILE?.trim();
  if (!file) return "";
  try {
    return readFileSync(file, "utf8").trim();
  } catch {
    return "";
  }
}

async function requirePaperMutationSession(req: Parameters<RequestAuthenticator["getSession"]>[0], auth: RequestAuthenticator) {
  if (!auth.requireAuth) return;
  const session = await auth.getSession(req);
  if (!session) throw Object.assign(new Error("Active session required."), { status: 401, code: "AUTH_REQUIRED" });
  auth.requireCsrf(req, session);
}

export function canManagePaperTradeComments(user: { role?: string } | null | undefined) {
  return user?.role === "admin";
}

async function requirePaperCommentAdmin(req: Parameters<RequestAuthenticator["getSession"]>[0], auth: RequestAuthenticator, requireCsrf = false) {
  const session = await auth.getSession(req);
  if (!session) throw Object.assign(new Error("Active administrator session required."), { status: 401, code: "AUTH_REQUIRED" });
  if (!canManagePaperTradeComments(session.user)) {
    throw Object.assign(new Error("Administrator access required."), { status: 403, code: "ADMIN_REQUIRED" });
  }
  if (requireCsrf) auth.requireCsrf(req, session);
  return session;
}

export function registerWorkspaceRoutes(app: Express, prisma: PrismaClient, auth: RequestAuthenticator, paperPrisma: PrismaClient = prisma) {
  app.get("/v1/trade-quality/policy", (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.json(TRADE_QUALITY_POLICY);
  });

  app.get("/v1/workspace/paper-trading/bootstrap", async (req, res, next) => {
    try {
      const session = await auth.getSession(req);
      const canComment = canManagePaperTradeComments(session?.user);
      // This endpoint is the durable first paint. Keep it independent of the
      // bars_1m, stop-path, OIIS-evidence and capital-simulation work used by
      // the complete ledger so the workspace can always explain what is
      // loading instead of showing an empty page or expiring a client timer.
      const [summary, recent] = await runWithConcurrency([
        () => paperPrisma.$queryRawUnsafe<Row[]>(`
          select
            (select count(*)::int from paper_trading.trade_groups) as total_groups,
            (select count(*)::int from paper_trading.trade_groups where status in ('OPEN','PARTIALLY_OPEN','PARTIALLY_CLOSED','PENDING_ENTRY')) as active_groups,
            (select count(*)::int from paper_trading.trade_groups where status='CLOSED') as closed_groups,
            (select count(*)::int from paper_trading.trade_groups where status='PENDING_ENTRY') as pending_entry_groups,
            (select count(*)::int from paper_trading.positions where remaining_quantity > 0) as open_positions,
            (select coalesce(sum(realised_pnl),0)::text from paper_trading.positions) as realised_pnl,
            (select coalesce(sum(amount),0)::text from paper_trading.pnl_ledger where entry_kind='REALISED_GROSS') as realised_gross_pnl,
            (select coalesce(sum(unrealised_pnl),0)::text from paper_trading.positions) as unrealised_pnl,
            (select max(last_mark_at) from paper_trading.positions) as latest_mark_at,
            (select count(*)::int from paper_trading.target_tracks where status in ('ACTIVE','PENDING_ENTRY')) as active_target_tracks,
            (select count(*)::int from paper_trading.data_quality_incidents where status not in ('RECOVERED','RESOLVED','CLOSED')) as open_data_incidents
        `),
        () => paperPrisma.$queryRawUnsafe<Row[]>(`
          select g.trade_group_id::text,g.strategy_id,g.status,g.created_at,
                 coalesce(sum(p.realised_pnl),0)::text as realised_pnl,
                 coalesce(sum(p.unrealised_pnl),0)::text as unrealised_pnl
          from paper_trading.trade_groups g
          left join paper_trading.trade_legs l using(trade_group_id)
          left join paper_trading.positions p using(trade_leg_id)
          group by g.trade_group_id
          order by g.created_at desc limit 5
        `)
      ], 2);
      res.setHeader("Cache-Control", "private, no-store");
      res.json({
        asOf: new Date().toISOString(),
        environment: "PAPER",
        detailState: "LOADING",
        summary: {
          ...(summary[0] ?? {}),
          quality_policy_version: TRADE_QUALITY_POLICY.version
        },
        recent,
        statuses: [],
        openPositions: [],
        stockTrades: [],
        targetConversion: [],
        targetExitScenarios: [],
        fixedCapitalPortfolioScenarios: [],
        fixedCapitalPortfolioStrategyComparisons: [],
        fixedCapitalSwingOnlyScenarios: [],
        fixedCapitalSwingOnlyStrategyComparisons: [],
        tradeQualityPolicy: TRADE_QUALITY_POLICY,
        targetStatuses: [],
        incidents: [],
        permissions: { can_manage_comments: canComment, can_manage_trade_quality: canComment }
      });
    } catch (error) { next(error); }
  });

  app.get("/v1/workspace/paper-trading", async (req, res, next) => {
    try {
      const session = await auth.getSession(req);
      const canComment = canManagePaperTradeComments(session?.user);
      // The production API pool has four connections and also serves snapshot,
      // notification and quote work. This read previously fanned eight queries
      // out at once, causing Prisma P2024 acquisition timeouts. Keep this route
      // to one connection at a time so it cannot starve the rest of the API.
      const [summary, statuses, recent, openPositions, stockTrades, targetStatuses, incidents, targetConversion] = await runWithConcurrency([
        () => paperPrisma.$queryRawUnsafe<Row[]>(`
          select
            (select count(*)::int from paper_trading.trade_groups) as total_groups,
            (select count(*)::int from paper_trading.trade_groups where status in ('OPEN','PARTIALLY_OPEN','PARTIALLY_CLOSED','PENDING_ENTRY')) as active_groups,
            (select count(*)::int from paper_trading.trade_groups where status='CLOSED') as closed_groups,
            (select count(*)::int from paper_trading.trade_groups where status='PENDING_ENTRY') as pending_entry_groups,
            (select count(*)::int from paper_trading.positions where remaining_quantity > 0) as open_positions,
            (select coalesce(sum(realised_pnl),0)::text from paper_trading.positions) as realised_pnl,
            (select coalesce(sum(amount),0)::text from paper_trading.pnl_ledger where entry_kind='REALISED_GROSS') as realised_gross_pnl,
            (select coalesce(sum(unrealised_pnl),0)::text from paper_trading.positions) as unrealised_pnl,
            (select max(last_mark_at) from paper_trading.positions) as latest_mark_at,
            (select count(*)::int from paper_trading.webhook_outbox where status not in ('DELIVERED','CANCELLED')) as pending_webhooks,
            (select max(delivered_at) from paper_trading.webhook_outbox where status='DELIVERED') as latest_webhook_delivery,
            (select count(*)::int from paper_trading.target_tracks where status in ('ACTIVE','PENDING_ENTRY')) as active_target_tracks,
            (select count(*)::int from paper_trading.target_tracks where status in ('HIT','CLOSED_AT_TARGET')) as completed_target_tracks,
            (select count(*)::int from paper_trading.data_quality_incidents where status not in ('RECOVERED','RESOLVED','CLOSED')) as open_data_incidents
        `),
        () => paperPrisma.$queryRawUnsafe<Row[]>(`
          select status, count(*)::int as count
          from paper_trading.trade_groups group by status order by count(*) desc, status
        `),
        () => paperPrisma.$queryRawUnsafe<Row[]>(`
          select g.trade_group_id::text,g.strategy_id,g.strategy_version,g.asset_class,g.status,g.fully_closed,
                 g.opened_at,g.closed_at,g.created_at,count(distinct l.trade_leg_id)::int as leg_count,
                 coalesce(sum(l.remaining_quantity),0)::text as remaining_units,
                 coalesce(sum(p.realised_pnl),0)::text as realised_pnl,
                 coalesce(sum(p.unrealised_pnl),0)::text as unrealised_pnl,max(p.last_mark_at) as last_mark_at
          from paper_trading.trade_groups g
          left join paper_trading.trade_legs l on l.trade_group_id=g.trade_group_id
          left join paper_trading.positions p on p.trade_leg_id=l.trade_leg_id
          group by g.trade_group_id order by g.created_at desc limit 20
        `),
        () => paperPrisma.$queryRawUnsafe<Row[]>(`
          select g.trade_group_id::text,g.strategy_id,g.strategy_version,g.asset_class,g.status as group_status,
                 l.trade_leg_id::text,l.side,l.quantity_unit,l.status as leg_status,
                 i.symbol,i.underlying,i.exchange,i.segment,i.expiry,i.strike::text,i.option_type,
                 p.opened_quantity::text,p.closed_quantity::text,p.remaining_quantity::text,
                 p.average_entry_price::text,p.last_mark::text,p.unrealised_pnl::text,p.realised_pnl::text,
                 l.opened_at,p.last_mark_at
          from paper_trading.positions p
          join paper_trading.trade_legs l on l.trade_leg_id=p.trade_leg_id
          join paper_trading.trade_groups g on g.trade_group_id=l.trade_group_id
          join paper_trading.instrument_snapshots i on i.instrument_snapshot_id=l.instrument_snapshot_id
          where p.remaining_quantity > 0
          order by coalesce(p.last_mark_at,l.opened_at,g.created_at) desc,g.trade_group_id,l.trade_leg_id
        `),
        () => paperPrisma.$queryRawUnsafe<Row[]>(`
          select g.trade_group_id::text,g.strategy_id,g.strategy_version,g.asset_class,g.status as group_status,g.closed_at,
                 g.performance_basis_type,g.performance_basis_amount::text,g.metadata,
                 qr.ratings as review_ratings,qr.hard_fail_flags as review_hard_fail_flags,
                 qr.entry_evidence_confirmed as review_entry_evidence_confirmed,
                 qr.evidence_note as review_evidence_note,qr.reviewer_email as review_reviewer_email,
                 qr.reviewed_at as review_reviewed_at,
                 dc.run_id::text as evidence_run_id,dc.available_at as evidence_available_at,
                 dc.sector as evidence_sector,dc.direction as evidence_direction,
                 dc.data_quality::text as evidence_data_quality,dc.data_permission as evidence_data_permission,
                 dc.ofactor::text as evidence_ofactor,dc.xfactor_snapshot::text as evidence_xfactor,
                 dc.directional_edge::text as evidence_directional_edge,dc.quality_score::text as evidence_quality_score,
                 dc.rsi14::text as evidence_rsi14,dc.willr14::text as evidence_willr14,
                 dc.atr14::text as evidence_atr14,dc.volume_vs_sma20::text as evidence_volume_ratio,
                 dc.reference_price::text as evidence_reference_price,dc.buy_limit::text as evidence_buy_limit,
                 dc.no_chase_price::text as evidence_no_chase_price,dc.component_scores as evidence_component_scores,
                 dc.gate_evidence as evidence_gate_evidence,dc.reason_codes as evidence_reason_codes,
                 a.opening_cash::text as account_opening_cash,a.risk_limits as account_risk_limits,
                 coalesce((select sum(c.amount) from paper_trading.charge_ledger c where c.trade_group_id=g.trade_group_id),0)::text as charges_total,
                 coalesce((select sum(f.spread_cost+f.slippage_cost) from paper_trading.paper_fills f where f.trade_leg_id=l.trade_leg_id),0)::text as fill_friction_total,
                 (select count(*)::int from paper_trading.paper_fills f where f.trade_leg_id=l.trade_leg_id) as fill_count,
                 l.trade_leg_id::text,l.side,l.status as leg_status,i.symbol,i.lot_size::text as snapshot_lot_size,
                 fno.lotsize::text as fno_lot_size,fno.expiry as fno_lot_expiry,
                 p.opened_quantity::text,p.remaining_quantity::text,p.average_entry_price::text,
                 p.last_mark::text,p.last_mark_at,p.unrealised_pnl::text,p.realised_pnl::text,l.opened_at,
                 eme.availability_status as entry_book_status,eme.quote_ts as entry_book_quote_ts,
                 eme.quote_age_ms::text as entry_book_quote_age_ms,eme.quote_source as entry_book_quote_source,
                 eme.ltp::text as entry_book_ltp,eme.last_trade_qty::text as entry_book_last_trade_qty,
                 eme.cumulative_volume::text as entry_book_cumulative_volume,
                 eme.total_buy_qty::text as entry_book_total_buy_qty,eme.total_sell_qty::text as entry_book_total_sell_qty,
                 eme.best_bid_price::text as entry_book_best_bid_price,eme.best_bid_qty::text as entry_book_best_bid_qty,
                 eme.best_ask_price::text as entry_book_best_ask_price,eme.best_ask_qty::text as entry_book_best_ask_qty,
                 eme.bid_levels as entry_bid_levels,eme.ask_levels as entry_ask_levels,
                 eme.bid_level_count::int as entry_bid_level_count,eme.ask_level_count::int as entry_ask_level_count,
                 eme.detail as entry_book_detail,
                 case when g.closed_at is not null
                    and (g.closed_at at time zone 'Asia/Kolkata')::date=(l.opened_at at time zone 'Asia/Kolkata')::date
                    and (g.closed_at at time zone 'Asia/Kolkata')::time<=time '15:30:59'
                   then true else false end as closed_in_intraday,
                 carry_quote.ltp::text as carry_mark,carry_quote.ts as carry_mark_at,
                 entry_day.eod_close::text as intraday_eod_mark,entry_day.eod_mark_at as intraday_eod_mark_at,
                 entry_day.session_high::text as intraday_session_high,entry_day.session_low::text as intraday_session_low,
                 entry_day.bar_count::int as intraday_bar_count,entry_day.eod_complete as intraday_eod_complete,
                 stop_rule.stop_price::text as stop_loss_price,stop_hit.hit_at as stop_loss_hit_at,
                 stop_hit.exit_price::text as stop_loss_exit_price,
                 coalesce((select sum(e.amount) from paper_trading.pnl_ledger e
                   where e.trade_group_id=g.trade_group_id and e.entry_kind='REALISED_GROSS'),0)::text as realised_gross_pnl,
                 case when p.average_entry_price>0 and p.last_mark is not null then
                   (case when l.side='BUY' then p.last_mark-p.average_entry_price else p.average_entry_price-p.last_mark end)
                   / p.average_entry_price end::text as current_return,
                 o.status as observation_status,o.sessions_observed::int as sessions_observed,
                 o.bars_observed::int as bars_observed,o.mfe::text,o.mae::text,
                 o.highest_price::text,o.lowest_price::text,o.last_session_date,
                 coalesce((
                   select jsonb_agg(jsonb_build_object(
                     'lifecycle',d.lifecycle,'target_pct',d.target_pct::text,'target_price',t.target_price::text,
                     'status',t.status,'first_hit_at',t.first_hit_at,'gross_pnl',h.gross_pnl::text,
                     'estimated_costs',h.estimated_costs::text,'tax_provision',h.tax_provision::text,'after_tax_pnl',h.after_tax_pnl::text
                   ) order by d.lifecycle,d.target_pct)
                   from paper_trading.target_tracks t
                   join paper_trading.target_definitions d using(target_definition_id)
                   left join paper_trading.target_hits h using(target_track_id)
                   where t.trade_leg_id=l.trade_leg_id
                 ),'[]'::jsonb) as targets,
                 coalesce((
                   select jsonb_agg(jsonb_build_object(
                     'horizon_sessions',h.horizon_sessions,'status',h.status,'completed_at',h.completed_at,
                     'mfe',h.max_high_return::text,'mae',h.mae::text,'closing_return',h.closing_return::text,
                     'after_cost_pnl',h.after_cost_pnl::text,'after_tax_pnl',h.after_tax_pnl::text
                   ) order by h.horizon_sessions)
                   from paper_trading.horizon_outcomes h where h.observation_tracker_id=o.observation_tracker_id
                 ),'[]'::jsonb) as horizons
          from paper_trading.positions p
          join paper_trading.trade_legs l using(trade_leg_id)
          join paper_trading.trade_groups g using(trade_group_id)
          join paper_trading.accounts a using(account_id)
          join paper_trading.instrument_snapshots i using(instrument_snapshot_id)
          left join paper_trading.entry_market_evidence eme using(trade_leg_id)
          left join lateral (
            select f.lotsize,f.expiry
            from public.instruments f
            where f.exchange='NFO' and f.instrumenttype='FUTSTK'
              and f.expiry >= current_date
              and f.name=upper(coalesce(i.underlying,regexp_replace(i.symbol,'-EQ$','','i')))
            order by f.expiry,f.updated_at desc
            limit 1
          ) fno on true
          left join lateral (
            select q.last_price as ltp,q.last_seen_ts as ts
            from public.instrument_state q
            where q.exchange=i.exchange and q.symbol_token=i.instrument_token and q.last_price>0
            limit 1
          ) carry_quote on true
          left join lateral (
            select (array_agg(b.close order by b.ts desc))[1] as eod_close,
                   max(b.ts) as eod_mark_at,max(b.high) as session_high,min(b.low) as session_low,
                   count(*)::int as bar_count,
                   coalesce((max(b.ts) at time zone 'Asia/Kolkata')::time>=time '15:29:00',false) as eod_complete
            from public.bars_1m b
            where b.exchange=i.exchange and b.symbol_token=i.instrument_token
              and b.ts>=l.opened_at
              and b.ts<=(((l.opened_at at time zone 'Asia/Kolkata')::date+time '15:30:59') at time zone 'Asia/Kolkata')
          ) entry_day on true
          left join lateral (
            select case when l.side='SELL'
              then p.average_entry_price+(6000::numeric/nullif(p.opened_quantity,0))
              else p.average_entry_price-(6000::numeric/nullif(p.opened_quantity,0))
            end as stop_price
          ) stop_rule on true
          left join lateral (
            select b.ts as hit_at,
                   case when l.side='SELL'
                     then greatest(stop_rule.stop_price,b.open)
                     else least(stop_rule.stop_price,b.open)
                   end as exit_price
            from public.bars_1m b
            where b.exchange=i.exchange and b.symbol_token=i.instrument_token
              and b.ts>=l.opened_at and b.ts<=least(
                coalesce((
                  select c.market_close_ts from public.trading_calendar c
                  where c.is_trading_day=true
                    and c.trade_date>=(l.opened_at at time zone 'Asia/Kolkata')::date
                  order by c.trade_date offset 29 limit 1
                ),now()),now())
              and ((l.side='SELL' and b.high>=stop_rule.stop_price)
                or (l.side<>'SELL' and b.low<=stop_rule.stop_price))
            order by b.ts
            limit 1
          ) stop_hit on true
          left join paper_trading.observation_trackers o using(trade_leg_id)
          left join lateral (
            select d.* from oiis_live.daily_candidate d
            where upper(d.symbol)=upper(regexp_replace(i.symbol,'-EQ$','','i'))
              and d.available_at <= coalesce(l.opened_at,g.opened_at,g.created_at)
              and d.direction=(case when l.side='SELL' then 'SHORT' else 'LONG' end)
            order by (d.run_id::text=coalesce(g.metadata->>'run_id','')) desc,d.available_at desc,d.created_at desc
            limit 1
          ) dc on true
          left join paper_trading.v_trade_quality_review_latest qr
            on qr.trade_group_id=g.trade_group_id and qr.policy_version='${TRADE_QUALITY_POLICY.version}'
          where g.asset_class='EQUITY' and p.opened_quantity>0
          order by l.opened_at desc,g.trade_group_id
        `),
        () => paperPrisma.$queryRawUnsafe<Row[]>(`
          select status,count(*)::int as count
          from paper_trading.target_tracks group by status order by count(*) desc,status
        `),
        () => paperPrisma.$queryRawUnsafe<Row[]>(`
          select incident_type,status,count(*)::int as count,max(detected_at) as latest_detected_at
          from paper_trading.data_quality_incidents
          group by incident_type,status order by latest_detected_at desc limit 20
        `),
        () => paperPrisma.$queryRawUnsafe<Row[]>(`
          select d.lifecycle,d.target_pct::text,
                 count(*) filter (where t.activated_at is not null)::int as eligible,
                 count(*) filter (where t.status in ('HIT','CLOSED_AT_TARGET'))::int as hits,
                 count(*) filter (where t.status in ('NOT_HIT_INTRADAY','TIMED_OUT'))::int as mature_misses,
                 percentile_cont(0.5) within group (
                   order by extract(epoch from (t.first_hit_at-t.activated_at))/60
                 ) filter (where t.first_hit_at is not null)::double precision as median_minutes
          from paper_trading.target_tracks t
          join paper_trading.target_definitions d using(target_definition_id)
          group by d.lifecycle,d.target_pct
          order by d.lifecycle,d.target_pct
        `)
      ], 1);
      const commentSummary = canComment ? await paperPrisma.$queryRawUnsafe<Row[]>(`
        select c.trade_group_id::text,count(*)::int as comment_count,
               (array_agg(c.body order by c.created_at desc,c.comment_id desc))[1] as latest_comment,
               max(c.created_at) as latest_comment_at
        from paper_trading.trade_comments c
        group by c.trade_group_id
      `) : [];
      const commentsByTrade = new Map(commentSummary.map((row) => [String(row.trade_group_id), row]));
      const trades = stockTrades.map((row) => paperTradeProjection({
        ...row,
        ...(commentsByTrade.get(String(row.trade_group_id)) ?? (canComment ? { comment_count: 0, latest_comment: null, latest_comment_at: null } : {}))
      }));
      const gradeCounts = trades.reduce<Record<string, number>>((counts, trade) => {
        const grade = String(trade.analytical_grade);
        counts[grade] = (counts[grade] ?? 0) + 1;
        return counts;
      }, {});
      const matureTrades = trades.filter((trade) => trade.mature_5d);
      const estimableQuality = trades.filter((trade) => typeof trade.quality_score === "number");
      const qualityScore = estimableQuality.length
        ? Math.round(estimableQuality.reduce((total, trade) => total + finiteNumber(trade.quality_score), 0) / estimableQuality.length)
        : null;
      const analyticalUpside = trades.reduce((total, trade) => total + Math.max(0, finiteNumber(trade.entry_notional) * finiteNumber(trade.mfe_30d_pct) / 100), 0);
      const analyticalDownside = trades.reduce((total, trade) => total + Math.max(0, finiteNumber(trade.entry_notional) * Math.abs(Math.min(0, finiteNumber(trade.mae_30d_pct))) / 100), 0);
      const realisedGross = finiteNumber(summary[0]?.realised_gross_pnl);
      const unrealisedGross = finiteNumber(summary[0]?.unrealised_pnl);
      const combinedGross = realisedGross + unrealisedGross;
      const captureEfficiency = analyticalUpside > 0 ? combinedGross / analyticalUpside * 100 : null;
      const scenarios = paperTargetExitScenarios(trades);
      const capitalAsOf = new Date();
      const capitalStrategyComparisons = paperCapitalStrategyComparisons(trades, capitalAsOf);
      const swingOnlyCapitalStrategyComparisons = paperCapitalStrategyComparisons(trades, capitalAsOf, "SWING_ONLY");
      res.json({
        asOf: new Date().toISOString(),
        environment: "PAPER",
        summary: {
          ...(summary[0] ?? {}),
          total_evaluated_trades: trades.length,
          grade_counts: gradeCounts,
          quality_score: qualityScore,
          quality_policy_version: TRADE_QUALITY_POLICY.version,
          quality_estimable_trade_count: estimableQuality.length,
          quality_not_estimable_trade_count: trades.length - estimableQuality.length,
          mature_trade_count: matureTrades.length,
          analytical_upside: analyticalUpside,
          analytical_downside: analyticalDownside,
          combined_gross_pnl: combinedGross,
          accounting_basis: "REALISED_GROSS_PLUS_OPEN_UNREALISED_GROSS",
          capture_efficiency_pct: captureEfficiency
        },
        statuses,
        recent,
        openPositions,
        stockTrades: trades,
        targetConversion,
        targetExitScenarios: scenarios,
        fixedCapitalPortfolioScenarios: capitalStrategyComparisons[0]?.scenarios ?? [],
        fixedCapitalPortfolioStrategyComparisons: capitalStrategyComparisons,
        fixedCapitalSwingOnlyScenarios: swingOnlyCapitalStrategyComparisons[0]?.scenarios ?? [],
        fixedCapitalSwingOnlyStrategyComparisons: swingOnlyCapitalStrategyComparisons,
        tradeQualityPolicy: TRADE_QUALITY_POLICY,
        targetStatuses,
        incidents,
        permissions: { can_manage_comments: canComment, can_manage_trade_quality: canComment }
      });
    } catch (error) { next(error); }
  });

  app.post("/v1/workspace/paper-trading/manual-trades", async (req, res, next) => {
    try {
      await requirePaperMutationSession(req, auth);
      const parsed = manualPaperTradeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: { code: "INVALID_PAPER_TRADE", message: parsed.error.issues[0]?.message, issues: parsed.error.issues } });
      }
      const input = parsed.data;
      const symbol = input.symbol.toUpperCase();
      const exchange = input.assetClass === "EQUITY" ? "NSE" : "NFO";
      const instruments = input.assetClass === "EQUITY"
        ? await prisma.$queryRawUnsafe<Row[]>(`
            select exchange,symbol_token,tradingsymbol,name,instrumenttype,expiry,strike::text,lotsize
            from public.instruments
            where exchange='NSE' and (tradingsymbol=$1 or tradingsymbol=$2)
              and coalesce(instrumenttype,'EQ') in ('EQ','')
            order by updated_at desc limit 1`, symbol, `${symbol}-EQ`)
        : await prisma.$queryRawUnsafe<Row[]>(`
            select exchange,symbol_token,tradingsymbol,name,instrumenttype,expiry,strike::text,lotsize
            from public.instruments
            where exchange='NFO' and tradingsymbol=$1 and instrumenttype in ('OPTSTK','OPTIDX')
              and expiry > current_date
            order by updated_at desc limit 1`, symbol);
      const instrument = instruments[0];
      if (!instrument) {
        return res.status(404).json({ error: { code: "INSTRUMENT_NOT_FOUND", message: input.assetClass === "EQUITY" ? `No NSE equity instrument matched ${symbol}.` : `No active NFO option contract matched ${symbol}; enter the complete trading symbol.` } });
      }
      const fnoLots = input.assetClass === "EQUITY"
        ? await prisma.$queryRawUnsafe<Row[]>(`
            select lotsize,expiry,tradingsymbol
            from public.instruments
            where exchange='NFO' and instrumenttype='FUTSTK'
              and upper(name)=upper($1) and expiry >= current_date
              and lotsize is not null and lotsize > 0
            order by expiry,updated_at desc limit 1`, String(instrument.name ?? symbol).replace(/-EQ$/i, ""))
        : [];
      const currentFnoLot = fnoLots[0];
      if (input.assetClass === "EQUITY" && !currentFnoLot) {
        return res.status(422).json({ error: { code: "FNO_LOT_NOT_FOUND", message: `No active FUTSTK lot size is available for ${symbol}; the paper trade was not created.` } });
      }
      const token = paperServiceToken();
      const paperApiUrl = (process.env.PAPER_API_URL ?? "http://paper-api:8088").replace(/\/+$/, "");
      if (!token) return res.status(503).json({ error: { code: "PAPER_SERVICE_NOT_CONFIGURED", message: "Manual paper entry is unavailable because the internal paper-service credential is not mounted." } });

      const eventId = randomUUID();
      const occurredAt = new Date().toISOString();
      const isOption = input.assetClass === "OPTION";
      const tradingSymbol = String(instrument.tradingsymbol);
      const optionType = tradingSymbol.endsWith("CE") ? "CALL" : tradingSymbol.endsWith("PE") ? "PUT" : null;
      const expiry = instrument.expiry instanceof Date ? instrument.expiry.toISOString().slice(0, 10) : instrument.expiry ? String(instrument.expiry).slice(0, 10) : null;
      const quantityUnit = isOption ? "LOTS" : "SHARES";
      const quantity = isOption ? Number(input.quantity ?? 1) : Number(currentFnoLot.lotsize);
      const lotSize = isOption ? Number(instrument.lotsize ?? 1) : quantity;
      const payload = {
        schema_version: "1.0",
        client_event_id: `manual-ui-${eventId}`,
        account_id: "paper-main",
        environment: "PAPER",
        source: { service: "n50-manual-paper-ui", instance: "n50-dashboard" },
        strategy: { strategy_id: "MANUAL_UI", strategy_name: "Manual Paper Trade", strategy_family: "OPERATOR", strategy_version: "1.0.0", strategy_run_id: null, signal_id: eventId, tags: ["manual", "paper"] },
        signal: { occurred_at: occurredAt, exchange_timezone: "Asia/Kolkata", direction: input.side === "BUY" ? "LONG" : "SHORT", confidence: null, reason_codes: ["MANUAL_OPERATOR_ENTRY"], features: {} },
        trade_group: { client_group_id: `manual-ui-${eventId}`, asset_class: input.assetClass, expected_leg_count: 1, group_entry_policy: "ATOMIC", group_close_policy: "ALL_LEGS", performance_basis: { type: "ENTRY_NOTIONAL", amount: null, currency: "INR" } },
        legs: [{
          client_leg_id: "leg-1", role: "PRIMARY", position_effect: "OPEN",
          instrument: {
            instrument_id: `${exchange}:${isOption ? "OPT" : "CASH"}:${tradingSymbol}`,
            instrument_token: String(instrument.symbol_token), exchange, segment: isOption ? "OPT" : "CASH",
            symbol: tradingSymbol, isin: null, underlying: String(instrument.name ?? symbol), expiry,
            strike: isOption ? String(instrument.strike) : null, option_type: isOption ? optionType : null,
            lot_size: String(lotSize), contract_multiplier: "1", currency: "INR"
          },
          side: input.side, quantity: { value: String(quantity), unit: quantityUnit },
          entry_order: { type: input.orderType, limit_price: input.orderType === "LIMIT" ? String(input.limitPrice) : null, stop_price: null, time_in_force: "DAY", price_source: "NEXT_AVAILABLE_BAR_OPEN", explicit_price: null }
        }],
        execution_policy: { mode: "RULES", intraday_square_off: false, square_off_time: null, exit_rules: [
          { rule_id: "I100", kind: "TARGET_PCT", value: "0.010", action: "FULL_CLOSE", target_lifecycle: "INTRADAY" },
          { rule_id: "S300", kind: "TARGET_PCT", value: "0.030", action: "FULL_CLOSE", target_lifecycle: "SWING" }
        ] },
        analytics_policy: { apply_default_ladders: true, intraday_targets_pct: ["0.003", "0.004", "0.005", "0.010"], swing_targets_pct: ["0.010", "0.030", "0.050"], horizons_trading_sessions: [5, 30], track_after_execution_close: true, snapshot_cadence: "EVENTS_AND_EOD" },
        cost_profile_id: isOption ? "india-options-current" : "india-equity-current",
        tax_profile_id: "management-profit-tax-35pct",
        metadata: {
          notes: input.notes || "Manual PAPER TRADE created from the authenticated UI",
          entry_origin: "MANUAL_UI",
          sizing_policy: isOption ? "ONE_OPTION_LOT" : "ONE_CURRENT_FNO_LOT",
          fno_lot_size: lotSize,
          quality_evidence: {
            captured_at: occurredAt,
            evidence_scope: "ENTRY_TIME_ONLY",
            trade_reason: input.tradeReason,
            initial_stop_pct: input.initialStopPct,
            max_holding_sessions: input.maxHoldingSessions,
            ratings: isOption ? { O01: 3, O06: 3 } : { C01: 3, C08: 3 },
            hard_fail_flags: [],
            data_valid: true
          }
        }
      };
      const upstream = await fetch(`${paperApiUrl}/api/v1/trade-intents`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Idempotency-Key": `manual-ui-${eventId}`, "X-Correlation-Id": eventId, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload), signal: AbortSignal.timeout(20_000)
      });
      const responseBody = await upstream.text();
      let responseJson: unknown;
      try { responseJson = JSON.parse(responseBody); } catch { responseJson = { detail: responseBody || "Empty paper-service response" }; }
      if (!upstream.ok) return res.status(upstream.status).json(responseJson);
      res.setHeader("X-Trading-Environment", "PAPER");
      return res.status(upstream.status).json(responseJson);
    } catch (error) { next(error); }
  });

  app.get("/v1/workspace/paper-trading/trades/:tradeGroupId", async (req, res, next) => {
    try {
      const session = await auth.getSession(req);
      const canComment = canManagePaperTradeComments(session?.user);
      const tradeGroupId = z.string().uuid().parse(req.params.tradeGroupId);
      const tradeRows = await prisma.$queryRawUnsafe<Row[]>(`
        select g.trade_group_id::text,g.strategy_id,g.strategy_version,g.asset_class,g.status as group_status,g.closed_at,g.created_at,
               g.performance_basis_type,g.performance_basis_amount::text,g.metadata,
               l.trade_leg_id::text,l.side,l.status as leg_status,l.opened_at,
               i.symbol,i.underlying,i.exchange,i.instrument_token,i.segment,i.expiry,i.strike::text,i.option_type,i.snapshot as instrument_snapshot,
               p.opened_quantity::text,p.closed_quantity::text,p.remaining_quantity::text,
               p.average_entry_price::text,p.last_mark::text,p.last_mark_at,p.unrealised_pnl::text,p.realised_pnl::text,
               eme.availability_status as entry_book_status,eme.quote_ts as entry_book_quote_ts,
               eme.quote_age_ms::text as entry_book_quote_age_ms,eme.quote_source as entry_book_quote_source,
               eme.ltp::text as entry_book_ltp,eme.last_trade_qty::text as entry_book_last_trade_qty,
               eme.cumulative_volume::text as entry_book_cumulative_volume,
               eme.total_buy_qty::text as entry_book_total_buy_qty,eme.total_sell_qty::text as entry_book_total_sell_qty,
               eme.best_bid_price::text as entry_book_best_bid_price,eme.best_bid_qty::text as entry_book_best_bid_qty,
               eme.best_ask_price::text as entry_book_best_ask_price,eme.best_ask_qty::text as entry_book_best_ask_qty,
               eme.bid_levels as entry_bid_levels,eme.ask_levels as entry_ask_levels,
               eme.bid_level_count::int as entry_bid_level_count,eme.ask_level_count::int as entry_ask_level_count,
               eme.detail as entry_book_detail,
               o.observation_tracker_id::text,o.status as observation_status,o.entry_session,o.last_session_date,
               o.sessions_observed::int,o.bars_observed::int,o.mfe::text,o.mae::text,o.highest_price::text,o.lowest_price::text,
               o.time_below_entry_minutes::int,o.recovery_at,o.completed_at,o.censor_reason
        from paper_trading.trade_groups g
        join paper_trading.trade_legs l using(trade_group_id)
        join paper_trading.positions p using(trade_leg_id)
        join paper_trading.instrument_snapshots i using(instrument_snapshot_id)
        left join paper_trading.entry_market_evidence eme using(trade_leg_id)
        left join paper_trading.observation_trackers o using(trade_leg_id)
        where g.trade_group_id=$1::uuid and g.asset_class='EQUITY'
        order by l.opened_at
        limit 1`, tradeGroupId);
      const tradeRow = tradeRows[0];
      if (!tradeRow) return res.status(404).json({ error: { code: "PAPER_TRADE_NOT_FOUND", message: "Paper equity trade not found." } });
      const [targets, horizons, events, bars, comments] = await Promise.all([
        prisma.$queryRawUnsafe<Row[]>(`
          select d.lifecycle,d.target_code,d.target_pct::text,d.execution_action,
                 t.status,t.target_price::text,t.activated_at,t.first_hit_at,t.elapsed_bars::text,t.elapsed_minutes::text,
                 h.hit_at,h.source_price::text,h.assumed_exit_price::text,h.sequence_ambiguous,h.calculation_version,h.source_bar_id::text
          from paper_trading.target_tracks t
          join paper_trading.target_definitions d using(target_definition_id)
          left join paper_trading.target_hits h using(target_track_id)
          where t.trade_leg_id=$1::uuid
          order by d.lifecycle,d.target_pct`, String(tradeRow.trade_leg_id)),
        tradeRow.observation_tracker_id ? prisma.$queryRawUnsafe<Row[]>(`
          select horizon_sessions,status,completed_at,max_high_return::text as mfe,mae::text,
                 closing_return::text,after_cost_pnl::text,after_tax_pnl::text,detail
          from paper_trading.horizon_outcomes
          where observation_tracker_id=$1::uuid
          order by horizon_sessions`, String(tradeRow.observation_tracker_id)) : Promise.resolve([]),
        prisma.$queryRawUnsafe<Row[]>(`
          select event_id::text,sequence::text,event_type,event_time,subject,payload
          from paper_trading.trade_events
          where aggregate_id=$1::uuid
          order by sequence`, tradeGroupId),
        prisma.$queryRawUnsafe<Row[]>(`
          select ts,open::text,high::text,low::text,close::text,volume::text,source
          from public.bars_1m
          where exchange=$1 and symbol_token=$2 and ts >= $3::timestamptz
          order by ts
          limit 1500`, String(tradeRow.exchange), String(tradeRow.instrument_token), tradeRow.opened_at),
        canComment ? prisma.$queryRawUnsafe<Row[]>(`
          select comment_id::text,trade_group_id::text,author_uid,author_email,body,created_at,updated_at
          from paper_trading.trade_comments
          where trade_group_id=$1::uuid
          order by created_at desc,comment_id desc`, tradeGroupId) : Promise.resolve([])
      ]);
      const projected = paperTradeProjection({ ...tradeRow, targets, horizons });
      const entry = finiteNumber(tradeRow.average_entry_price);
      const direction = tradeRow.side === "BUY" ? 1 : -1;
      const series = bars.map((bar) => ({
        ts: bar.ts,
        close: finiteNumber(bar.close),
        return_pct: entry > 0 ? direction * (finiteNumber(bar.close) / entry - 1) * 100 : null,
        high_return_pct: entry > 0 ? direction * ((direction > 0 ? finiteNumber(bar.high) : finiteNumber(bar.low)) / entry - 1) * 100 : null,
        low_return_pct: entry > 0 ? direction * ((direction > 0 ? finiteNumber(bar.low) : finiteNumber(bar.high)) / entry - 1) * 100 : null,
        volume: finiteNumber(bar.volume),
        source: bar.source
      }));
      return res.json({
        environment: "PAPER",
        asOf: new Date().toISOString(),
        trade: projected,
        targets,
        horizons,
        series,
        evidence: {
          source_table: "public.bars_1m",
          source_resolution: "1m",
          bars_observed: finiteNumber(tradeRow.bars_observed),
          observed_through: tradeRow.last_mark_at,
          observation_status: tradeRow.observation_status,
          entry_session: tradeRow.entry_session,
          last_session_date: tradeRow.last_session_date,
          calculation_version: "TARGET_V1 / POSITION_AWARE_V2",
          sequence_policy: "UNKNOWN_WITHIN_BAR when finer ordering is unavailable"
        },
        events,
        comments,
        permissions: { can_manage_comments: canComment }
      });
    } catch (error) { next(error); }
  });

  app.get("/v1/workspace/paper-trading/trades/:tradeGroupId/comments", async (req, res, next) => {
    try {
      await requirePaperCommentAdmin(req, auth);
      const tradeGroupId = z.string().uuid().parse(req.params.tradeGroupId);
      const comments = await prisma.$queryRawUnsafe<Row[]>(`
        select c.comment_id::text,c.trade_group_id::text,c.author_uid,c.author_email,c.body,c.created_at,c.updated_at
        from paper_trading.trade_comments c
        join paper_trading.trade_groups g using(trade_group_id)
        where c.trade_group_id=$1::uuid and g.asset_class='EQUITY'
        order by c.created_at desc,c.comment_id desc`, tradeGroupId);
      return res.json({ environment: "PAPER", tradeGroupId, comments });
    } catch (error) { next(error); }
  });

  app.post("/v1/workspace/paper-trading/trades/:tradeGroupId/comments", async (req, res, next) => {
    try {
      const session = await requirePaperCommentAdmin(req, auth, true);
      const tradeGroupId = z.string().uuid().parse(req.params.tradeGroupId);
      const parsed = paperTradeCommentSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          error: { code: "INVALID_PAPER_TRADE_COMMENT", message: parsed.error.issues[0]?.message, issues: parsed.error.issues }
        });
      }
      const commentId = randomUUID();
      const correlationId = randomUUID();
      const inserted = await prisma.$queryRawUnsafe<Row[]>(`
        insert into paper_trading.trade_comments(comment_id,trade_group_id,author_uid,author_email,body)
        select $1::uuid,g.trade_group_id,$3,$4,$5
        from paper_trading.trade_groups g
        where g.trade_group_id=$2::uuid and g.asset_class='EQUITY'
        returning comment_id::text,trade_group_id::text,author_uid,author_email,body,created_at,updated_at`,
        commentId, tradeGroupId, session.user.uid, session.user.email, parsed.data.body);
      const comment = inserted[0];
      if (!comment) {
        return res.status(404).json({ error: { code: "PAPER_TRADE_NOT_FOUND", message: "Paper equity trade not found." } });
      }
      await prisma.$executeRawUnsafe(`
        insert into paper_trading.request_audit(source_service,correlation_id,authentication_result,operation,result,detail)
        values ('n50-dashboard',$1::uuid,'PASS','PAPER_TRADE_COMMENT_CREATE','CREATED',
                jsonb_build_object('trade_group_id',$2::text,'comment_id',$3::text,'actor_uid',$4::text))`,
        correlationId, tradeGroupId, commentId, session.user.uid);
      return res.status(201).json({ environment: "PAPER", comment });
    } catch (error) { next(error); }
  });

  app.post("/v1/workspace/paper-trading/trades/:tradeGroupId/quality-review", async (req, res, next) => {
    try {
      const session = await requirePaperCommentAdmin(req, auth, true);
      const tradeGroupId = z.string().uuid().parse(req.params.tradeGroupId);
      const parsed = tradeQualityReviewSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: { code: "INVALID_TRADE_QUALITY_REVIEW", message: parsed.error.issues[0]?.message, issues: parsed.error.issues } });
      }
      const tradeRows = await prisma.$queryRawUnsafe<Row[]>(`
        select trade_group_id::text,asset_class from paper_trading.trade_groups where trade_group_id=$1::uuid`, tradeGroupId);
      const trade = tradeRows[0];
      if (!trade) return res.status(404).json({ error: { code: "PAPER_TRADE_NOT_FOUND", message: "Paper trade not found." } });
      const assetClass = String(trade.asset_class).toUpperCase() === "OPTION" ? "OPTION" : "EQUITY";
      const policy = assetClass === "OPTION" ? TRADE_QUALITY_POLICY.options : TRADE_QUALITY_POLICY.cash;
      const criterionIds = new Set(policy.criteria.map((item) => item.id));
      const hardFailIds = new Set(policy.hardFails.map((item) => item.id));
      const unknownRatings = Object.keys(parsed.data.ratings).filter((id) => !criterionIds.has(id));
      const unknownHardFails = parsed.data.hardFailFlags.filter((id) => !hardFailIds.has(id));
      if (unknownRatings.length || unknownHardFails.length) {
        return res.status(400).json({ error: { code: "UNKNOWN_TRADE_QUALITY_FACTOR", message: `Unknown factor IDs: ${[...unknownRatings, ...unknownHardFails].join(", ")}` } });
      }
      const latest = await prisma.$queryRawUnsafe<Row[]>(`
        select review_id::text from paper_trading.v_trade_quality_review_latest
        where trade_group_id=$1::uuid and policy_version=$2`, tradeGroupId, TRADE_QUALITY_POLICY.version);
      const reviewId = randomUUID();
      const inserted = await prisma.$queryRawUnsafe<Row[]>(`
        insert into paper_trading.trade_quality_reviews(
          review_id,trade_group_id,policy_id,policy_version,asset_class,ratings,hard_fail_flags,
          entry_evidence_confirmed,evidence_note,reviewer_uid,reviewer_email,supersedes_review_id
        ) values($1::uuid,$2::uuid,$3,$4,$5,$6::jsonb,$7::text[],$8,$9,$10,$11,$12::uuid)
        returning review_id::text,trade_group_id::text,policy_version,asset_class,ratings,hard_fail_flags,
                  entry_evidence_confirmed,evidence_note,reviewer_email,reviewed_at`,
        reviewId, tradeGroupId, TRADE_QUALITY_POLICY.policyId, TRADE_QUALITY_POLICY.version, assetClass,
        JSON.stringify(parsed.data.ratings), [...new Set(parsed.data.hardFailFlags)], parsed.data.entryEvidenceConfirmed,
        parsed.data.evidenceNote, session.user.uid, session.user.email, latest[0]?.review_id ?? null);
      await prisma.$executeRawUnsafe(`
        insert into paper_trading.request_audit(source_service,correlation_id,authentication_result,operation,result,detail)
        values ('n50-dashboard',$1::uuid,'PASS','TRADE_QUALITY_REVIEW_CREATE','CREATED',
                jsonb_build_object('trade_group_id',$2::text,'review_id',$3::text,'actor_uid',$4::text,'policy_version',$5::text))`,
        randomUUID(), tradeGroupId, reviewId, session.user.uid, TRADE_QUALITY_POLICY.version);
      return res.status(201).json({ environment: "PAPER", review: inserted[0] });
    } catch (error) { next(error); }
  });

  app.get("/v1/workspace/nifty-500", async (_req, res, next) => {
    try {
      const [latest, history] = await Promise.all([
        prisma.$queryRawUnsafe<Row[]>(`
          select * from nse_app.market_summary_daily order by trade_date desc limit 1
        `),
        prisma.$queryRawUnsafe<Row[]>(`
          select trade_date, securities_count, advancers, decliners, unchanged, positive_ratio::text,
                 nifty_close::text, nifty_return::text, market_regime
          from nse_app.market_summary_daily order by trade_date desc limit 30
        `)
      ]);
      res.json({ asOf: new Date().toISOString(), latest: latest[0] ?? null, history });
    } catch (error) { next(error); }
  });

  app.get("/v1/workspace/futures", async (_req, res, next) => {
    try {
      const [rows, contracts] = await Promise.all([prisma.$queryRawUnsafe<Row[]>(`
        select market_date, client_type, instrument_type, buy_contracts::text, sell_contracts::text,
               open_interest_long::text, open_interest_short::text,
               call_long::text, call_short::text, put_long::text, put_short::text
        from institutional_flow.normalized_nse_derivatives_participants
        order by market_date desc, client_type, instrument_type limit 120
      `), prisma.$queryRawUnsafe<Row[]>(`
        with futures as (
          select iu.*,
                 row_number() over(partition by iu.underlying order by iu.expiry,iu.tradingsymbol)::int as expiry_rank
          from public.instrument_universe iu
          where iu.active_to is null and iu.instrumenttype in ('FUTSTK','FUTIDX')
            and iu.expiry >= current_date
        ), cash as (
          select distinct on (underlying) underlying,symbol_token
          from public.instrument_universe
          where active_to is null and exchange='NSE' and coalesce(instrumenttype,'')=''
          order by underlying,active_from desc
        )
        select f.underlying,f.tradingsymbol,f.expiry,f.expiry_rank,
               fs.last_price::text as futures_price,cs.last_price::text as spot_price,
               (fs.last_price-cs.last_price)::text as basis,
               case when cs.last_price>0 then ((fs.last_price-cs.last_price)/cs.last_price*100)::text end as basis_pct,
               case when cs.last_price>0 then ((fs.last_price-cs.last_price)/cs.last_price*365/greatest(f.expiry-current_date,1)*100)::text end as annualised_basis_pct,
               fs.last_oi::text as open_interest,fs.last_oi_change_pct::text as oi_change_pct,
               fs.percent_change::text as price_change_pct,fs.last_volume::text as volume,
               fs.last_bid::text as bid,fs.last_ask::text as ask,fs.last_seen_ts,
               case when coalesce(fs.percent_change,0)>0 and coalesce(fs.last_oi_change_pct,0)>0 then 'LONG_BUILDUP'
                    when coalesce(fs.percent_change,0)<0 and coalesce(fs.last_oi_change_pct,0)>0 then 'SHORT_BUILDUP'
                    when coalesce(fs.percent_change,0)>0 and coalesce(fs.last_oi_change_pct,0)<0 then 'SHORT_COVERING'
                    when coalesce(fs.percent_change,0)<0 and coalesce(fs.last_oi_change_pct,0)<0 then 'LONG_UNWINDING'
                    else 'NEUTRAL' end as buildup
        from futures f
        left join public.instrument_state fs on fs.exchange=f.exchange and fs.symbol_token=f.symbol_token
        left join cash c on c.underlying=f.underlying
        left join public.instrument_state cs on cs.exchange='NSE' and cs.symbol_token=c.symbol_token
        where f.expiry_rank <= 2
        order by f.expiry_rank,f.underlying
      `)]);
      res.json({ asOf: new Date().toISOString(), ...futuresWorkspacePayload(contracts, rows) });
    } catch (error) { next(error); }
  });

  app.get("/v1/workspace/control-plane", async (req, res, next) => {
    const session = await auth.getSession(req);
    if (!session || session.user.role !== "admin" || !session.user.uid.startsWith("local-admin:")) {
      return res.status(403).json({ error: { code: "ADMIN_REQUIRED", message: "Administrator access required." } });
    }
    try {
      const [database, tables, activity, collectorSockets, collectorSubscriptions, collectorRequests, collectorFreshness] = await Promise.all([
        prisma.$queryRawUnsafe<Row[]>(`
          select current_database() as database_name,
                 pg_size_pretty(pg_database_size(current_database())) as database_size,
                 now() as checked_at
        `),
        prisma.$queryRawUnsafe<Row[]>(`
          select schemaname, count(*)::int as table_count,
                 pg_size_pretty(sum(pg_total_relation_size(format('%I.%I', schemaname, tablename)::regclass))) as total_size
          from pg_tables where schemaname in ('nse','nse_app','nse_intraday','market_data','paper_trading','institutional_flow')
          group by schemaname order by schemaname
        `),
        prisma.$queryRawUnsafe<Row[]>(`
          select count(*)::int as connections,
                 count(*) filter (where state = 'active')::int as active_connections
          from pg_stat_activity where datname = current_database()
        `),
        prisma.$queryRawUnsafe<Row[]>(`
          select distinct on (connection_id)
                 connection_id,status,subscriptions_count,last_tick_ts,ticks_received::text as ticks_received,
                 sequence_gaps::text as sequence_gaps,archive_dropped::text as archive_dropped,stale_token_count,ts,detail
          from public.websocket_health
          order by connection_id,ts desc
        `),
        prisma.$queryRawUnsafe<Row[]>(`
          select kind,mode,active,count(*)::int as count
          from public.subscriptions
          group by kind,mode,active
          order by active desc,kind,mode
        `),
        prisma.$queryRawUnsafe<Row[]>(`
          select endpoint,count(*)::int as requests,
                 count(*) filter (where success)::int as successes,
                 count(*) filter (where throttled or http_status=429)::int as throttles,
                 count(*) filter (where not success)::int as failures,
                 round(avg(latency_ms)::numeric,1)::text as average_latency_ms,
                 max(ts) as latest_request_at
          from public.api_request_log
          where ts >= now()-interval '1 hour'
          group by endpoint order by endpoint
        `),
        prisma.$queryRawUnsafe<Row[]>(`
          select 'market ticks' as dataset,
                 (select max(last_tick_ts) from public.websocket_health) as latest_at,
                 (select coalesce(sum(n_live_tup),0)::bigint::text from pg_stat_user_tables where relname='market_ticks' or relname like 'market_ticks_%') as estimated_rows
          union all select 'depth 5',(select max(last_tick_ts) from public.websocket_health),(select coalesce(sum(n_live_tup),0)::bigint::text from pg_stat_user_tables where relname='depth_5_snapshots' or relname like 'depth_5_snapshots_%')
          union all select 'option chain',(select max(ts) from public.smartapi_option_chain_snapshots),(select coalesce(sum(n_live_tup),0)::bigint::text from pg_stat_user_tables where relname='smartapi_option_chain_snapshots' or relname like 'smartapi_option_chain_snapshots_%')
          union all select 'instrument state',(select max(last_seen_ts) from public.instrument_state),(select coalesce(sum(n_live_tup),0)::bigint::text from pg_stat_user_tables where relname='instrument_state')
          union all select 'one-minute bars',(select max(last_completed_minute) from public.watermarks),(select coalesce(sum(n_live_tup),0)::bigint::text from pg_stat_user_tables where relname='bars_1m' or relname like 'bars_1m_%')
        `)
      ]);
      const activeSubscriptions = collectorSubscriptions
        .filter((row) => row.active === true)
        .reduce((total, row) => total + Number(row.count ?? 0), 0);
      const throttleCount = collectorRequests.reduce((total, row) => total + Number(row.throttles ?? 0), 0);
      const archiveDropped = collectorSockets.reduce((maximum, row) => Math.max(maximum, Number(row.archive_dropped ?? 0)), 0);
      res.json({
        asOf: new Date().toISOString(), database: database[0] ?? {}, activity: activity[0] ?? {}, schemas: tables,
        collector: {
          mode: "READ_ONLY_PAPER",
          activeSubscriptions,
          throttleCount,
          archiveDropped,
          sockets: collectorSockets,
          subscriptions: collectorSubscriptions,
          requests: collectorRequests,
          freshness: collectorFreshness
        }
      });
    } catch (error) { next(error); }
  });
}
