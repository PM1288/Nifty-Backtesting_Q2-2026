import assert from "node:assert/strict";
import test from "node:test";
import { cashSessions, monthlyMembership, replayRecordedCapital, verifyTradeSessions, type Row } from "./paperVerifiedReplay";
const asOf = "2026-09-18T12:00:00.000Z";
function trade(id = "one", entry = "2026-09-10T03:45:00.000Z"): Row {
  return { trade_leg_id: id, trade_group_id: id, symbol: id, side: "BUY", exchange: "NSE", segment: "CASH", quantity_unit: "SHARES", average_entry_price: "100", total_units: 100, opened_at: entry, fills: [{ position_effect: "OPEN", filled_at: entry, price: "100", quantity: 100 }], sessions: [] };
}
function verified(row: Row): Row { return { ...row, verified: verifyTradeSessions(row, asOf) }; }

test("S0 inclusive cash calendar excludes weekend and Ganesh Chaturthi", () => {
  assert.deepEqual(cashSessions("2026-09-10", 5), ["2026-09-10", "2026-09-11", "2026-09-15", "2026-09-16", "2026-09-17"]);
  assert.deepEqual(cashSessions("2027-01-01", 5), []);
});
test("horizon only completes with every expected minute and actual closing bar", () => {
  const row = trade();
  row.sessions = cashSessions("2026-09-10", 5).map((date) => ({ date, valid_count: 375, invalid_count: 0, high: "105", low: "99", close: "102", last_at: `${date}T09:59:00Z` }));
  let output = verifyTradeSessions(row, asOf);
  assert.equal(output.horizons[0].status, "VERIFIED_COMPLETE");
  assert.equal(output.horizons[0].expected_end_at, "2026-09-17T10:00:00.000Z");
  assert.equal(output.horizons[1].status, "CENSORED");
  row.sessions[2].valid_count = 374;
  output = verifyTradeSessions(row, asOf);
  assert.equal(output.horizons[0].status, "CENSORED");
  row.sessions[2].invalid_count = 1;
  assert.equal(verifyTradeSessions(row, asOf).horizons[0].status, "DATA_INVALID");
});
test("morning cutoff cannot borrow a completed session or final high", () => {
  const row = trade();
  row.sessions = [{ date: "2026-09-10", valid_count: 20, high: 101, low: 100, close: 101, last_at: "2026-09-10T04:04Z", hits: [{ target: .003, at: "2026-09-10T04:05Z" }] }];
  const result = verifyTradeSessions(row, "2026-09-10T04:00Z");
  assert.equal(result.horizons[0].status, "CENSORED");
  assert.equal(result.horizons[0].observed_mfe_pct, null);
  assert.equal(result.opportunities[0].status, "CENSORED");
});
test("missing target window is censored, and valid touch does not become executed", () => {
  const row = trade();
  row.sessions = [{ date: "2026-09-10", valid_count: 1, high: 101, low: 100, close: 101, last_at: "2026-09-10T03:45Z", hits: [{ target: .003, at: "2026-09-10T03:45Z" }] }];
  const result = verifyTradeSessions(row, asOf);
  assert.equal(result.opportunities[0].status, "HIT");
  assert.equal(result.opportunities[0].execution, "NOT_INFERRED_FROM_TOUCH");
  assert.equal(result.opportunities[1].status, "CENSORED");
});
test("capital is not freed by a target hit or current mark", () => {
  const rows = [verified(trade("a")), verified(trade("b")), verified(trade("c"))];
  rows[0].targets = [{ first_hit_at: "2026-09-10T04:00Z", target_pct: .003 }];
  const result = replayRecordedCapital(rows, 200000, asOf);
  assert.equal(result.taken, 2); assert.equal(result.skipped, 1);
  assert.equal(result.ending_cash, 0); assert.equal(result.unmarked_open_positions, 2);
});
test("partial closing fills release only proportional capital", () => {
  const first = trade("a");
  first.fills.push({ position_effect: "CLOSE", filled_at: "2026-09-10T04:00Z", price: 110, quantity: 50 });
  const second = trade("b", "2026-09-10T04:01Z");
  const third = trade("c", "2026-09-10T04:02Z");
  const result = replayRecordedCapital([verified(first), verified(second), verified(third)], 200000, asOf);
  assert.equal(result.taken, 2); assert.equal(result.skipped, 1);
  assert.equal(result.positions[0].remaining, 1000); assert.equal(result.realised_gross, 10000);
  assert.equal(result.ending_cash, 110000);
});
test("closing fill releases before simultaneous next entry, fees reduce returns", () => {
  const first = trade("a"); first.fills.push({ position_effect: "CLOSE", filled_at: "2026-09-10T04:00Z", price: 110, quantity: 100 });
  const rows = [verified(first), verified(trade("b")), verified(trade("c", "2026-09-10T04:00Z"))];
  assert.equal(replayRecordedCapital(rows, 200000, asOf).taken, 3);
  assert.ok(replayRecordedCapital(rows, 100000, asOf, { feesBps: 10, slippageBps: 5 }).ending_equity < replayRecordedCapital(rows, 100000, asOf).ending_equity);
});
test("monthly cohort is month-specific, cannot leak late signal or revised snapshot", () => {
  const row = trade("a");
  const candidate = { symbol: "a", evaluation_month: "2026-09-01", signal_date: "2026-09-09", created_at: "2026-09-09T12:00Z", updated_at: "2026-09-09T12:00Z", conditions: [{ pass: true }] };
  assert.equal(monthlyMembership(row, [candidate], true).included, true);
  assert.equal(monthlyMembership(row, [{ ...candidate, updated_at: "2026-09-18T12:00Z" }], true).reason, "QUALIFICATION_NOT_RECORDED_BEFORE_ENTRY");
  assert.equal(monthlyMembership(row, [{ ...candidate, signal_date: "2026-09-11" }]).reason, "SIGNAL_AFTER_ENTRY");
  assert.equal(monthlyMembership(row, [{ ...candidate, evaluation_month: "2026-08-01" }]).reason, "NO_MONTHLY_CANDIDATE");
});
test("one issuer challenger and short P&L preserve independent identities", () => {
  const a = verified(trade("a")), b = verified({ ...trade("b"), symbol: "a" });
  assert.equal(replayRecordedCapital([a, b], 100000, asOf, { oneIssuer: true }).taken, 1);
  const short = trade("s"); short.side = "SELL"; short.fills.push({ position_effect: "CLOSE", filled_at: "2026-09-10T04:00Z", price: 90, quantity: 100 });
  assert.equal(replayRecordedCapital([verified(short)], 100000, asOf).realised_gross, 10000);
});
test("known qualification identifies only evidence recorded before entry", () => {
  const row = trade("a");
  const earlier = { candidate_id: "earlier", symbol: "a", evaluation_month: "2026-09-01", signal_date: "2026-09-09", created_at: "2026-09-09T12:00Z", updated_at: "2026-09-09T12:00Z", conditions: [{ pass: true }] };
  const later = { ...earlier, candidate_id: "later", updated_at: "2026-09-18T12:00Z" };
  assert.deepEqual(monthlyMembership(row, [earlier, later], true).candidate_ids, ["earlier"]);
  assert.deepEqual(monthlyMembership(row, [earlier, later]).candidate_ids, ["earlier", "later"]);
});
