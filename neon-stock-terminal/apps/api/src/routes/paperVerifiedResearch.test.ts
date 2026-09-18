import assert from "node:assert/strict";
import test from "node:test";
import { buildVerifiedResearch } from "./paperVerifiedResearch";
test("target challenger is independent of recorded exits and preserves original ledger", () => {
  const entry = "2026-09-10T03:45:00Z", exit = "2026-09-10T04:00:00Z";
  const row = { trade_leg_id: "a", symbol: "A", side: "BUY", exchange: "NSE", segment: "CASH", quantity_unit: "SHARES", opened_at: entry, total_units: 100, average_entry_price: 100,
    fills: [{ position_effect: "OPEN", filled_at: entry, price: 100, quantity: 100 }, { position_effect: "CLOSE", filled_at: exit, price: 90, quantity: 100 }],
    sessions: [{ date: "2026-09-10", valid_count: 1, invalid_count: 0, high: 101, low: 100, close: 100.5, last_at: entry, hits: [{ target: .004, at: entry }] }] };
  const before = JSON.stringify(row);
  const report = buildVerifiedResearch([row], [], "2026-09-18T12:00:00Z");
  assert.equal(report.cohorts[0].scenarios[0].realised_gross, -10000);
  const assumed = report.cohorts[0].shadow_targets.find((item: any) => item.lifecycle === "INTRADAY" && item.target_pct === .004);
  assert.ok(assumed);
  assert.ok(Math.abs(assumed.scenarios[0].realised_gross - 400) < 1e-8);
  assert.equal(assumed.scenarios[0].assumptions.exits, "ASSUMED_FILL_AFTER_TOUCH_BAR_END");
  assert.equal(report.cohorts[1].source_count, 0);
  assert.equal(JSON.stringify(row), before);
});
