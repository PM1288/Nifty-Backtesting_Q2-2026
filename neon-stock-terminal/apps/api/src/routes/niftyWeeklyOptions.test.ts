import assert from "node:assert/strict";
import test from "node:test";
import { buildNiftyOiAnalytics, buildNiftyWeeklyStructure, NIFTY_WEEKLY_POLICY } from "./niftyWeeklyOptions";

const call = { strike: 24400, option_type: "CE", bid_price: 120, ask_price: 121, implied_volatility: 10, delta: 0.52, total_traded_volume: 1000, open_interest: 500 };
const put = { strike: 24400, option_type: "PE", bid_price: 82, ask_price: 83, implied_volatility: 9, delta: -0.48, total_traded_volume: 1100, open_interest: 600 };

test("NIFTY weekly strategy is isolated and cannot place live orders", () => {
  assert.equal(NIFTY_WEEKLY_POLICY.policyId, "NIFTY_WEEKLY_LONG_OPTIONS");
  assert.equal(NIFTY_WEEKLY_POLICY.liveOrdersEnabled, false);
  assert.equal(NIFTY_WEEKLY_POLICY.environment, "PAPER_RESEARCH");
});

test("weekly straddle uses asks for entry, bids for mark and NIFTY lot size", () => {
  const result = buildNiftyWeeklyStructure({ structureType: "BUY_ATM_STRADDLE", call, put, spot: 24400, lotSize: 65, snapshotAgeSeconds: 2, sessionPhase: "REGULAR", expectedMovePoints: 320 });
  assert.equal(result.combinedAsk, 204);
  assert.equal(result.combinedBid, 202);
  assert.equal(result.premiumRiskInr, 13_260);
  assert.deepEqual(result.safety, { openingSide: "BUY", closingSide: "SELL", liveOrdersEnabled: false });
});

test("new weekly strategy remains shadow until target probability is calibrated", () => {
  const result = buildNiftyWeeklyStructure({ structureType: "BUY_ATM_STRADDLE", call, put, spot: 24400, lotSize: 65, snapshotAgeSeconds: 2, sessionPhase: "REGULAR", expectedMovePoints: 320 });
  assert.equal(result.decision, "NO_TRADE");
  assert.ok(result.hardGateFailures.includes("TARGET_PROBABILITY_NOT_CALIBRATED"));
});

test("stale or closed-session chains fail closed", () => {
  const result = buildNiftyWeeklyStructure({ structureType: "BUY_ATM_STRADDLE", call, put, spot: 24400, lotSize: 65, snapshotAgeSeconds: 120, sessionPhase: "CLOSED", expectedMovePoints: 320 });
  assert.ok(result.hardGateFailures.includes("CHAIN_STALE"));
  assert.ok(result.hardGateFailures.includes("MARKET_NOT_REGULAR"));
});

test("NIFTY OI evidence calculates window PCR, walls and in-session change", () => {
  const current = [
    { strike: 24350, option_type: "CE", open_interest: 100, change_in_oi: 10 },
    { strike: 24400, option_type: "CE", open_interest: 300, change_in_oi: 20 },
    { strike: 24350, option_type: "PE", open_interest: 500, change_in_oi: 40 },
    { strike: 24400, option_type: "PE", open_interest: 100, change_in_oi: -10 },
  ];
  const previous = [
    { strike: 24350, option_type: "CE", open_interest: 90 },
    { strike: 24400, option_type: "CE", open_interest: 280 },
    { strike: 24350, option_type: "PE", open_interest: 450 },
    { strike: 24400, option_type: "PE", open_interest: 90 },
  ];
  const result = buildNiftyOiAnalytics({ legs: current, previousLegs: previous, capturedAt: "2026-08-14T05:10:00Z", previousCapturedAt: "2026-08-14T05:00:00Z" });
  assert.equal(result.totals.ceOi, 400);
  assert.equal(result.totals.peOi, 600);
  assert.equal(result.totals.pcr, 1.5);
  assert.equal(result.walls.call?.strike, 24400);
  assert.equal(result.walls.put?.strike, 24350);
  assert.equal(result.comparison?.ceOiChange, 30);
  assert.equal(result.comparison?.peOiChange, 60);
  assert.equal(result.comparison?.actualMinutes, 10);
  assert.equal(result.interpretation, "PUT_OI_DOMINANT");
});
