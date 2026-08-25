import assert from "node:assert/strict";
import test from "node:test";
import { canManagePaperTradeComments, futuresWorkspacePayload, paperTradeProjection } from "./workspace";

const base = {
  opened_at: "2026-08-11T04:00:00.000Z",
  side: "BUY",
  opened_quantity: "100",
  remaining_quantity: "100",
  average_entry_price: "100",
  realised_pnl: "0",
  unrealised_pnl: "300",
  observation_status: "ACTIVE",
  targets: [{ lifecycle: "INTRADAY", target_pct: "0.003", first_hit_at: "2026-08-11T04:30:00.000Z", status: "CLOSED_AT_TARGET" }]
};

test("futures workspace converts PostgreSQL window bigint ranks to JSON-safe numbers", () => {
  const payload = futuresWorkspacePayload(
    [{ underlying: "NIFTY", expiry_rank: 1n }],
    [{ client_type: "FII", buy_contracts: "10" }]
  );
  assert.equal(payload.contracts[0]?.expiry_rank, 1);
  assert.doesNotThrow(() => JSON.stringify(payload));
  assert.equal(payload.participantRows, payload.rows);
});

test("paper projection keeps actual economics separate from analytical extrema", () => {
  const projected = paperTradeProjection({
    ...base,
    carry_mark: "120",
    carry_mark_at: "2026-08-14T10:00:00.000Z",
    horizons: [{ horizon_sessions: 5, status: "COMPLETED", mfe: "0.060", mae: "-0.010", after_tax_pnl: "500" }]
  });
  assert.equal(projected.analytical_grade, "EXCELLENT");
  assert.equal(projected.actual_pnl, 300);
  assert.equal(projected.actual_pnl_per_unit, 3);
  assert.equal(projected.actual_pnl_total, 300);
  assert.equal(projected.actual_return_pct, 3);
  assert.equal(projected.mfe_5d_pct, 6);
  assert.equal(projected.mae_5d_pct, -1);
  assert.equal(projected.first_intraday_hit_minutes, 30);
  assert.equal(projected.hypothetical_carry_pnl, 2000);
  assert.ok(Math.abs(Number(projected.hypothetical_carry_return_pct) - 20) < 1e-9);
  assert.equal(projected.hypothetical_carry_mark_source, "SMARTAPI_QUOTE_CACHE");
  assert.equal(projected.horizon_5d_snapshot_pnl, 500);
  assert.equal(projected.horizon_5d_snapshot_state, "FROZEN_AT_5D");
  assert.equal(projected.horizon_30d_snapshot_pnl, 2000);
  assert.equal(projected.horizon_30d_snapshot_state, "DEVELOPING_INCLUSIVE");
});

test("paper projection backfills F&O-quantity and fixed two-lakh investment scenarios", () => {
  const projected = paperTradeProjection({
    ...base,
    average_entry_price: "1075.20",
    opened_quantity: "700",
    fno_lot_size: "700",
    carry_mark: "1086.50",
    realised_pnl: "2870",
    unrealised_pnl: "0",
    intraday_eod_complete: true,
    intraday_eod_mark: "1080.00",
    horizons: [
      { horizon_sessions: 5, status: "ACTIVE", mfe: "0.025", mae: "-0.012" },
      { horizon_sessions: 30, status: "ACTIVE", mfe: "0.041", mae: "-0.018" }
    ]
  });
  assert.equal(projected.fno_quantity_investment_required, 752640);
  assert.equal(projected.investment_price_basis, 1075.2);
  assert.equal(projected.investment_quantity_basis, 700);
  assert.equal(projected.fixed_investment_budget, 200000);
  assert.equal(projected.fixed_investment_quantity, 186);
  assert.ok(Math.abs(Number(projected.fixed_investment_deployed) - 199987.2) < 1e-9);
  assert.ok(Math.abs(Number(projected.fixed_investment_cash_remaining) - 12.8) < 1e-9);
  assert.ok(Math.abs(Number(projected.fixed_investment_actual_pnl) - 762.6) < 1e-9);
  assert.ok(Math.abs(Number(projected.fixed_investment_carry_pnl) - 2101.8) < 1e-9);
  assert.ok(Math.abs(Number(projected.fixed_investment_intraday_eod_pnl) - 892.8) < 1e-9);
  assert.ok(Math.abs(Number(projected.fixed_investment_mfe_30d_pnl) - 8199.4752) < 1e-9);
  assert.ok(Math.abs(Number(projected.fixed_investment_mae_30d_pnl) + 3599.7696) < 1e-9);
});

test("fixed two-lakh scenario is direction-normalised for short paper trades", () => {
  const projected = paperTradeProjection({
    ...base,
    side: "SELL",
    average_entry_price: "1000",
    opened_quantity: "250",
    carry_mark: "970",
    intraday_eod_complete: true,
    intraday_eod_mark: "980",
    horizons: []
  });
  assert.equal(projected.fixed_investment_quantity, 200);
  assert.equal(projected.fixed_investment_deployed, 200000);
  assert.equal(projected.fixed_investment_carry_pnl, 6000);
  assert.equal(projected.fixed_investment_intraday_eod_pnl, 4000);
  assert.equal(projected.trade_direction, "SHORT");
});

test("paper projection exposes entry touch and spread without converting missing book values to zero", () => {
  const longTrade = paperTradeProjection({
    ...base,
    entry_book_status: "CAPTURED",
    entry_book_best_bid_price: "99.90",
    entry_book_best_ask_price: "100.10",
    entry_bid_levels: [{ level: 1, price: "99.90", quantity: "500", orders: "4" }],
    entry_ask_levels: [{ level: 1, price: "100.10", quantity: "450", orders: "3" }]
  });
  assert.equal(longTrade.trade_direction, "LONG");
  assert.equal(longTrade.entry_book_reference_touch, 100.1);
  assert.equal(longTrade.entry_book_reference_touch_side, "ASK");
  assert.ok(Math.abs(Number(longTrade.entry_book_spread) - 0.2) < 1e-9);
  assert.ok(Math.abs(Number(longTrade.entry_book_spread_bps) - 20) < 0.02);

  const shortTrade = paperTradeProjection({
    ...base,
    side: "SELL",
    entry_book_status: "NO_TWO_SIDED_BOOK",
    entry_book_best_bid_price: "99.90",
    entry_book_best_ask_price: "0"
  });
  assert.equal(shortTrade.trade_direction, "SHORT");
  assert.equal(shortTrade.entry_book_reference_touch, 99.9);
  assert.equal(shortTrade.entry_book_reference_touch_side, "BID");
  assert.equal(shortTrade.entry_book_best_ask_price, null);
  assert.equal(shortTrade.entry_book_spread, null);
});

test("5D and inclusive 30D snapshots are identical before five-session maturity", () => {
  const projected = paperTradeProjection({
    ...base,
    carry_mark: "94",
    horizons: [],
    sessions_observed: 3
  });
  assert.equal(projected.horizon_5d_snapshot_pnl, -600);
  assert.equal(projected.horizon_30d_snapshot_pnl, -600);
  assert.equal(projected.horizon_5d_snapshot_state, "DEVELOPING");
  assert.equal(projected.horizon_30d_snapshot_state, "DEVELOPING_INCLUSIVE");
});

test("a 6000 rupee stop scenario uses the first breach exit and otherwise keeps the inclusive mark", () => {
  const hit = paperTradeProjection({
    ...base,
    opened_quantity: "100",
    average_entry_price: "100",
    carry_mark: "120",
    stop_loss_price: "40",
    stop_loss_hit_at: "2026-08-12T05:00:00.000Z",
    stop_loss_exit_price: "38",
    horizons: []
  });
  assert.equal(hit.stop_loss_limit, 6000);
  assert.equal(hit.stop_loss_hit, true);
  assert.equal(hit.stop_loss_scenario_pnl, -6200);
  assert.equal(hit.stop_loss_scenario_state, "EXITED_AT_FIRST_BREACH");

  const notHit = paperTradeProjection({ ...base, carry_mark: "120", horizons: [] });
  assert.equal(notHit.stop_loss_hit, false);
  assert.equal(notHit.stop_loss_scenario_pnl, 2000);
  assert.equal(notHit.stop_loss_scenario_state, "NO_BREACH_MARKED_CURRENT");
});

test("long paper projection derives completed D0 EOD and intraday extrema", () => {
  const projected = paperTradeProjection({
    ...base,
    average_entry_price: "100",
    opened_quantity: "100",
    intraday_eod_complete: true,
    intraday_eod_mark: "103",
    intraday_eod_mark_at: "2026-08-11T10:00:00.000Z",
    intraday_session_high: "106",
    intraday_session_low: "98",
    intraday_bar_count: 360,
    closed_in_intraday: false,
    horizons: []
  });
  assert.equal(projected.intraday_eod_pnl, 300);
  assert.ok(Math.abs(Number(projected.intraday_eod_return_pct) - 3) < 1e-9);
  assert.equal(projected.intraday_max_profit, 600);
  assert.equal(projected.intraday_max_drawdown, -200);
  assert.equal(projected.intraday_eod_mark_source, "BARS_1M_ENTRY_SESSION_CLOSE");
  assert.equal(projected.closed_in_intraday, false);
});

test("paper projection combines post-entry D0 evidence with later daily bars through entry-month end", () => {
  const projected = paperTradeProjection({
    ...base,
    intraday_session_high: "106",
    intraday_session_low: "98",
    entry_month_later_high: "114",
    entry_month_later_low: "91",
    entry_month_observed_through: "2026-08-25T12:00:00.000Z",
    entry_month_daily_sessions: 9,
    entry_month_complete: false,
    horizons: []
  });
  assert.equal(projected.entry_month_high, 114);
  assert.equal(projected.entry_month_low, 91);
  assert.equal(projected.entry_month_daily_sessions, 10);
  assert.equal(projected.entry_month_complete, false);
  assert.equal(projected.entry_month_observed_through, "2026-08-25T12:00:00.000Z");
});

test("short paper projection normalises D0 EOD reward and pain", () => {
  const projected = paperTradeProjection({
    ...base,
    side: "SELL",
    average_entry_price: "100",
    opened_quantity: "100",
    intraday_eod_complete: true,
    intraday_eod_mark: "96",
    intraday_session_high: "103",
    intraday_session_low: "94",
    closed_in_intraday: true,
    horizons: []
  });
  assert.equal(projected.intraday_eod_pnl, 400);
  assert.ok(Math.abs(Number(projected.intraday_eod_return_pct) - 4) < 1e-9);
  assert.equal(projected.intraday_max_profit, 600);
  assert.equal(projected.intraday_max_drawdown, -300);
  assert.equal(projected.closed_in_intraday, true);
});

test("an incomplete entry session does not invent a 15:30 EOD result", () => {
  const projected = paperTradeProjection({
    ...base,
    intraday_eod_complete: false,
    intraday_eod_mark: "103",
    intraday_session_high: "106",
    intraday_session_low: "98",
    horizons: []
  });
  assert.equal(projected.intraday_eod_mark, null);
  assert.equal(projected.intraday_eod_pnl, null);
  assert.equal(projected.intraday_eod_return_pct, null);
});

test("short paper economics treat a lower buy-to-close mark as profit", () => {
  const projected = paperTradeProjection({
    ...base,
    side: "SELL",
    opened_quantity: "150",
    fno_lot_size: "150",
    average_entry_price: "100",
    carry_mark: "88",
    last_mark: "90",
    unrealised_pnl: "1500",
    horizons: []
  });
  assert.equal(projected.actual_pnl_per_unit, 10);
  assert.equal(projected.actual_pnl_total, 1500);
  assert.equal(projected.actual_return_pct, 10);
  assert.equal(projected.execution_outcome, "OPEN_PROFIT");
  assert.equal(projected.quantity_matches_current_fno_lot, true);
  assert.equal(projected.lot_count, 1);
  assert.equal(projected.hypothetical_carry_pnl, 1800);
  assert.equal(projected.hypothetical_carry_return_pct, 12);
});

test("short paper economics treat a higher buy-to-close mark as a loss", () => {
  const projected = paperTradeProjection({
    ...base,
    side: "SELL",
    opened_quantity: "150",
    fno_lot_size: "150",
    average_entry_price: "100",
    last_mark: "110",
    unrealised_pnl: "-1500",
    horizons: []
  });
  assert.equal(projected.actual_pnl_per_unit, -10);
  assert.equal(projected.actual_pnl_total, -1500);
  assert.equal(projected.actual_return_pct, -10);
  assert.equal(projected.execution_outcome, "OPEN_LOSS");
});

test("an immature trade with a deep adverse excursion is explicitly at risk", () => {
  const projected = paperTradeProjection({
    ...base,
    unrealised_pnl: "-250",
    horizons: [],
    mfe: "0.006",
    mae: "-0.025"
  });
  assert.equal(projected.analytical_grade, "AT_RISK");
  assert.equal(projected.execution_outcome, "OPEN_LOSS");
  assert.equal(projected.mature_5d, false);
});

test("a closed execution remains a valid developing analytical observation", () => {
  const projected = paperTradeProjection({
    ...base,
    remaining_quantity: "0",
    realised_pnl: "125",
    unrealised_pnl: "0",
    horizons: [],
    mfe: "0.009",
    mae: "-0.004"
  });
  assert.equal(projected.execution_outcome, "CLOSED_PROFIT");
  assert.equal(projected.analytical_grade, "DEVELOPING");
});

test("paper projection exposes the governed entry strategy", () => {
  const projected = paperTradeProjection({
    ...base,
    metadata: { entry_rule: "PRICE_MOMENTUM_1D_1H_15M" }
  });
  assert.equal(projected.entry_strategy, "PRICE_MOMENTUM_1D_1H_15M");
  const unspecified = paperTradeProjection({ ...base, metadata: {} });
  assert.equal(unspecified.entry_strategy, "UNSPECIFIED");
});

test("paper trade comments are available only to administrators", () => {
  assert.equal(canManagePaperTradeComments(null), false);
  assert.equal(canManagePaperTradeComments({}), false);
  assert.equal(canManagePaperTradeComments({ role: "user" }), false);
  assert.equal(canManagePaperTradeComments({ role: "admin" }), true);
});
