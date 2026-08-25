import assert from "node:assert/strict";
import test from "node:test";
import { projectStoredTradeQuality, scoreTradeQuality, TRADE_QUALITY_POLICY } from "./tradeQuality";

test("policy weights retain 55/45 cash and 60/40 options split", () => {
  for (const policy of [TRADE_QUALITY_POLICY.cash, TRADE_QUALITY_POLICY.options]) {
    assert.equal(policy.criteria.filter((row) => row.phase === "PROCESS").reduce((sum, row) => sum + row.weight, 0), policy.processMaximum);
    assert.equal(policy.criteria.filter((row) => row.phase === "OUTCOME").reduce((sum, row) => sum + row.weight, 0), policy.outcomeMaximum);
    assert.equal(policy.processMaximum + policy.outcomeMaximum, 100);
  }
});

test("missing legacy evidence is not silently scored zero", () => {
  const result = scoreTradeQuality({ assetClass: "EQUITY", status: "CLOSED", afterTaxPnl: 1000 });
  assert.equal(result.totalScore, null);
  assert.equal(result.label, "NOT_ESTIMABLE");
  assert.equal(result.criteria[0].status, "NOT_ESTIMABLE");
});

test("confirmed hard fail overrides an otherwise profitable complete score", () => {
  const ratings = Object.fromEntries(TRADE_QUALITY_POLICY.cash.criteria.map((row) => [row.id, 5]));
  const result = scoreTradeQuality({ assetClass: "EQUITY", status: "CLOSED", processRatings: ratings, outcomeRatings: ratings, hardFailFlags: ["STOP_WIDENED"], effectiveRisk: 1000, afterTaxPnl: 5000, maeR: 0.1, exitCaptureRatio: 0.9 });
  assert.equal(result.totalScore, 100);
  assert.equal(result.label, "BAD_RISK");
});

test("open mark is scored only as a developing outcome and cannot leak into process", () => {
  const process = Object.fromEntries(TRADE_QUALITY_POLICY.cash.criteria.filter((row) => row.phase === "PROCESS").map((row) => [row.id, 5]));
  const result = scoreTradeQuality({ assetClass: "EQUITY", status: "OPEN", processRatings: process, effectiveRisk: 1000, afterTaxPnl: 5000, maeR: 0.1 });
  assert.equal(result.status, "DEVELOPING");
  assert.equal(result.criteria.find((row) => row.id === "C11")?.status, "SCORED");
  assert.match(String(result.criteria.find((row) => row.id === "C11")?.reason), /still developing/);
  assert.equal(result.criteria.find((row) => row.id === "C01")?.rating, 5);
});

test("point-in-time OIIS evidence produces an evolving numeric cash score", () => {
  const openedAt = "2026-08-12T05:35:00.000Z";
  const row = {
    asset_class: "EQUITY",
    side: "BUY",
    opened_at: openedAt,
    evidence_available_at: "2026-08-12T05:30:00.000Z",
    evidence_run_id: "run-at-entry",
    evidence_data_quality: 96,
    evidence_data_permission: "ALLOWED",
    evidence_rsi14: 62.4,
    evidence_willr14: -31.5,
    evidence_atr14: 11,
    evidence_volume_ratio: 1.7,
    evidence_reference_price: 100,
    evidence_no_chase_price: 102,
    evidence_component_scores: {
      xfactor: { risk_per_share: 2, reward_risk: 2.5, structural_stop: 98, components: {
        setup_integrity: 90, instrument_quality: 95, reward_path_quality: 80,
        trigger_confirmation: 90, entry_location_quality: 85, timing_session_quality: 80,
        stop_invalidation_quality: 90, liquidity_slippage_quality: 85, market_sector_synchronisation: 80,
      } },
      ofactor_long: { components: {
        market_regime_support: 75, relative_strength: 85, sector_industry_support: 80,
        trend_quality: 90, momentum_quality: 85, liquidity_tradability: 90, catalyst_context: 60,
      } },
    },
    opened_quantity: 100,
    remaining_quantity: 100,
    average_entry_price: 100,
    last_mark_at: "2026-08-12T08:30:00.000Z",
    unrealised_pnl: 300,
    realised_net_pnl: 0,
    mfe_5d_pct: 4,
    mae_5d_pct: -1,
    account_opening_cash: 1_000_000,
    charges_total: 20,
    fill_friction_total: 10,
    metadata: { sizing_policy: "FNO_LOT" },
  };
  const result = projectStoredTradeQuality(row);
  assert.equal(result.status, "DEVELOPING");
  assert.equal(result.scoreBasis, "NORMALISED_AVAILABLE_EVIDENCE");
  assert.equal(result.process.coveragePct, 100);
  assert.ok(result.totalScore != null && result.totalScore > 0);
  assert.notEqual(result.label, "NOT_ESTIMABLE");
  assert.equal(result.hardFailFlags.length, 0);
  assert.match(String(result.criteria.find((criterion) => criterion.id === "C04")?.reason), /run-at-entry/);
});

test("retrospective process ratings count only after entry-time evidence confirmation", () => {
  const ratings = Object.fromEntries(TRADE_QUALITY_POLICY.cash.criteria.map((row) => [row.id, 5]));
  const row = {
    asset_class: "EQUITY",
    remaining_quantity: 0,
    opened_quantity: 100,
    average_entry_price: 100,
    performance_basis_amount: 1000,
    realised_net_pnl: 2000,
    mae_5d_pct: -1,
    mfe_5d_pct: 4,
    review_ratings: ratings,
  };
  const unconfirmed = projectStoredTradeQuality({ ...row, review_entry_evidence_confirmed: false });
  assert.equal(unconfirmed.process.coveragePct, 0);
  assert.equal(unconfirmed.totalScore, null);
  const confirmed = projectStoredTradeQuality({ ...row, review_entry_evidence_confirmed: true });
  assert.equal(confirmed.process.coveragePct, 100);
  assert.equal(confirmed.totalScore, 100);
});
