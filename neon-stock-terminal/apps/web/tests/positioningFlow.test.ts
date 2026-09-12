import assert from "node:assert/strict";
import test from "node:test";
import {
  buildParticipantForwardEvaluation,
  buildStrikeFlowRows,
  contractBuildUp,
  fiiProAlignment,
  participantPositionState,
  summarizeStrikeFlow,
} from "../src/lib/positioningFlow";

test("participant quadrant states distinguish position from change", () => {
  assert.equal(participantPositionState(10, 2), "Positive & adding");
  assert.equal(participantPositionState(10, -2), "Positive but reducing");
  assert.equal(participantPositionState(-10, 2), "Negative but improving");
  assert.equal(participantPositionState(-10, -2), "Negative & deepening");
  assert.equal(participantPositionState(null, 2), "Unavailable");
});

test("option contract build-up classification is purely mechanical and missing-safe", () => {
  assert.equal(contractBuildUp(2, 3), "Long build-up");
  assert.equal(contractBuildUp(-2, 3), "Short build-up");
  assert.equal(contractBuildUp(2, -3), "Short covering");
  assert.equal(contractBuildUp(-2, -3), "Long unwinding");
  assert.equal(contractBuildUp(0, 3), "Unchanged");
  assert.equal(contractBuildUp(null, 3), "Unavailable");
});

test("strike flow preserves baseline missingness and calculates side-specific shares", () => {
  const rows = buildStrikeFlowRows([
    { strike: 100, option_type: "CE", last_price: 12, day_open: 10, open_interest: 100, baseline_open_interest: 80, total_traded_volume: 50, oi_layers: { state: "COMPARABLE", change: 20 } },
    { strike: 100, option_type: "PE", last_price: 8, day_open: 10, open_interest: 200, baseline_open_interest: null, total_traded_volume: 100, oi_layers: { state: "CURRENT_ONLY_BASELINE_UNAVAILABLE", change: null } },
    { strike: 110, option_type: "CE", last_price: 6, day_open: 8, open_interest: 300, baseline_open_interest: 350, total_traded_volume: 150, oi_layers: { state: "COMPARABLE", change: -50 } },
    { strike: 110, option_type: "PE", last_price: 14, day_open: 12, open_interest: 200, baseline_open_interest: 180, total_traded_volume: 100, oi_layers: { state: "COMPARABLE", change: 20 } },
  ]);
  assert.equal(rows[0].ce.classification, "Long build-up");
  assert.equal(rows[0].pe.oiChange, null);
  assert.equal(rows[0].ce.oiShare, 0.25);
  assert.equal(rows[1].ce.deltaOiShare, 50 / 70);
  assert.equal(rows[0].pe.volumeShare, 0.5);
  const summary = summarizeStrikeFlow(rows);
  assert.equal(summary.ce.oi, 400);
  assert.equal(summary.pe.deltaOi, null);
  assert.equal(summary.oiPcr, 1);
  assert.equal(summary.marketState, "Change baseline unavailable");
});

test("FII and Pro alignment does not claim strike ownership", () => {
  const model = fiiProAlignment([
    { client_type: "FII", options_proxy: -10, delta_options_proxy: 2 },
    { client_type: "Pro", options_proxy: 5, delta_options_proxy: 3 },
    { client_type: "Client", options_proxy: 20, delta_options_proxy: -4 },
  ], "options_proxy");
  assert.equal(model.currentDirection, "DIVERGENT");
  assert.equal(model.changeDirection, "ALIGNED ADDING");
  assert.equal(model.clientRelation, "MIXED");
});

test("historical evaluation uses only the following completed daily candle", () => {
  const history = ["01", "02", "03"].map((day, index) => ({ trade_date: `2026-09-${day}`, client_type: "FII", options_proxy: index + 1, delta_options_proxy: index === 0 ? null : 1 }));
  const result = buildParticipantForwardEvaluation(history, [
    { date: "2026-09-02", open: 100, close: 101 },
    { date: "2026-09-03", open: 100, close: 102 },
    { date: "2026-09-04", open: 100, close: 103 },
  ], "options_proxy");
  assert.equal(result[0].participant, "FII");
  assert.equal(result[0].currentOpenCloseCorrelation.samples, 3);
  assert.ok((result[0].currentOpenCloseCorrelation.value ?? 0) > 0.99);
  assert.equal(result[0].deltaOpenCloseCorrelation.samples, 2);
  assert.equal(result[1].currentOpenCloseCorrelation.samples, 0);
});
