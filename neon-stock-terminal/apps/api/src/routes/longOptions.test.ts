import assert from "node:assert/strict";
import test from "node:test";
import { estimateTradingCharges, evaluateLongOptionCandidate } from "./longOptions";

const complete = {
  run_status: "COMPLETED",
  structure_type: "ATM_STRADDLE",
  underlying: "RELIANCE",
  expiry: "2026-08-25",
  call_token: "1",
  put_token: "2",
  call_symbol: "RELIANCE25AUG1400CE",
  put_symbol: "RELIANCE25AUG1400PE",
  call_bid: 20,
  call_ask: 20.1,
  put_bid: 19.8,
  put_ask: 19.9,
  combined_entry_ask: 40,
  combined_mark_bid: 39.8,
  combined_spread_pct: 0.005,
  lot_size: 500,
  quote_age_seconds: 2,
  quote_source_as_of: "2026-08-13T04:00:00Z",
  call_iv: 0.22,
  put_iv: 0.23,
  move_score_pre: 82,
  move_score_live: 80,
  probability_up: 0.51,
  direction_entropy: 0.99,
  forecast_implied_ratio: 1.5,
  expected_return_pct: 0.12,
  probability_profit: 0.68,
  pnl_p10: -0.18,
  pnl_p50: 0.10,
  pnl_p90: 0.42,
  rejection_reasons: [],
};

test("charge engine keeps statutory components separate", () => {
  const charges = estimateTradingCharges(25_000, 26_500, 4);
  assert.equal(charges.brokerage, 80);
  assert.equal(charges.stt, 39.75);
  assert.ok(charges.exchangeCharges > 18);
  assert.equal(charges.total, charges.brokerage + charges.stt + charges.exchangeCharges + charges.sebiCharges + charges.stampDuty + charges.gst);
});

test("ATM structure remains buy-to-open and sell-to-close", () => {
  const result = evaluateLongOptionCandidate(complete);
  assert.equal(result.strategyType, "BUY_ATM_STRADDLE");
  assert.deepEqual(result.safety, { openingSide: "BUY", closingSide: "SELL", liveOrdersEnabled: false });
  assert.equal(result.enabledState, "PAPER");
});

test("stale or one-sided evidence fails closed regardless of scores", () => {
  const result = evaluateLongOptionCandidate({ ...complete, call_bid: 0, quote_age_seconds: 30 });
  assert.equal(result.decision, "NO_TRADE");
  assert.ok(result.hardGateFailures.includes("TWO_SIDED_QUOTE_MISSING"));
  assert.ok(result.hardGateFailures.includes("QUOTE_STALE"));
  assert.ok(result.hardGateFailures.includes("DQS_GATE_FAIL"));
});

test("strangles map to the independent long-premium strategy", () => {
  const result = evaluateLongOptionCandidate({ ...complete, structure_type: "MEDIUM_STRANGLE", call_strike: 1450, put_strike: 1350 });
  assert.equal(result.strategyType, "BUY_DELTA_STRANGLE");
  assert.equal(result.enabledState, "PAPER");
  assert.ok(result.hardGateFailures.includes("WING_DELTA_NOT_ESTIMABLE"));
  assert.ok(result.hardGateFailures.includes("TAIL_RATIO_NOT_ESTIMABLE"));
});

test("an aggregate score cannot override unavailable execution evidence", () => {
  const result = evaluateLongOptionCandidate({ ...complete, call_strike: 1400, put_strike: 1400 });
  assert.equal(result.decision, "NO_TRADE");
  assert.ok(result.hardGateFailures.includes("SEQUENCE_CONTINUITY_NOT_VERIFIED"));
  assert.ok(result.hardGateFailures.includes("EVENT_STATE_UNKNOWN"));
  assert.ok(result.hardGateFailures.includes("BEST_ASK_DEPTH_NOT_ESTIMABLE"));
});
