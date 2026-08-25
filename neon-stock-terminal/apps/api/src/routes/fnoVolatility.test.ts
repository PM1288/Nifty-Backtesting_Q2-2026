import assert from "node:assert/strict";
import test from "node:test";
import { optionIntelligenceScores } from "./fnoVolatility";

const complete = {
  run_status: "COMPLETED",
  expiry: "2026-08-25",
  call_symbol: "XYZ25AUG100CE",
  put_symbol: "XYZ25AUG100PE",
  call_bid: 5,
  call_ask: 5.1,
  put_bid: 4.8,
  put_ask: 4.9,
  combined_entry_ask: 10,
  combined_spread_pct: 0.02,
  move_score_pre: 80,
  move_score_live: 78,
  forecast_implied_ratio: 1.3,
  expected_return_pct: 0.08,
  probability_profit: 0.62,
  direction_entropy: 0.96,
  reason_codes: []
};

const liquidChain = {
  snapshot_ts: "2026-08-11T04:00:00Z",
  quote_age_seconds: 2,
  contract_count: 14,
  two_sided_contracts: 14,
  depth_covered_contracts: 14,
  total_volume: 1_000_000,
  total_oi: 20_000_000,
  average_spread_pct: 0.015,
  average_ask: 12
};

test("complete executable evidence clears explainability score gates", () => {
  const result = optionIntelligenceScores(complete, liquidChain);
  assert.ok(result.dataQualityScore >= 80);
  assert.ok((result.contractQualityScore ?? 0) >= 70);
  assert.ok((result.valueEdgeScore ?? 0) >= 65);
  assert.ok((result.adjustedFinalReadinessScore ?? 0) >= 72);
  assert.deepEqual(result.hardGateFailures, []);
});

test("missing structure and stale one-sided quotes fail closed", () => {
  const result = optionIntelligenceScores({ move_score_pre: 95, move_score_live: 95 }, {
    ...liquidChain,
    quote_age_seconds: 999,
    two_sided_contracts: 0,
    depth_covered_contracts: 0,
    average_ask: null
  });
  assert.ok(result.dataQualityScore < 80);
  assert.equal(result.valueEdgeScore, null);
  assert.equal(result.adjustedFinalReadinessScore, null);
  assert.ok(result.hardGateFailures.includes("DATA_QUALITY_BELOW_MINIMUM"));
});

test("hard rejection remains visible even when weighted scores are strong", () => {
  const result = optionIntelligenceScores({ ...complete, reason_codes: ["OPTION_QUOTE_STALE"] }, liquidChain);
  assert.ok(result.hardGateFailures.includes("OPTION_QUOTE_STALE"));
});
