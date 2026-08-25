import test from "node:test";
import assert from "node:assert/strict";
import { summarizeRollingMonthlyCohort } from "../src/lib/rollingMonthlyCohort";

test("expiry cohort averages keep profit, loss and drawdown distinct", () => {
  const summary = summarizeRollingMonthlyCohort([
    {
      entry_eligible: true,
      expiry_evaluation_status: "MATURED",
      expiry_return_pct: "8.5",
      max_profit_pct: "12.25",
      max_drawdown_pct: "-2.5",
    },
    {
      entry_eligible: false,
      expiry_evaluation_status: "MATURED",
      expiry_return_pct: "-4.5",
      max_profit_pct: "2.75",
      max_drawdown_pct: "-7.5",
    },
  ]);

  assert.equal(summary.scannerMatches, 2);
  assert.equal(summary.qualityEligible, 1);
  assert.equal(summary.winners, 1);
  assert.equal(summary.losers, 1);
  assert.equal(summary.averageReturnPct, 2);
  assert.equal(summary.averageProfitPct, 8.5);
  assert.equal(summary.averageLossPct, -4.5);
  assert.equal(summary.averageMaxProfitPct, 7.5);
  assert.equal(summary.averageMaxDrawdownPct, -5);
});

test("unfinished expiry cohorts remain developing and never invent averages", () => {
  const summary = summarizeRollingMonthlyCohort([
    { entry_eligible: false, expiry_evaluation_status: "DEVELOPING" },
  ]);

  assert.equal(summary.developing, 1);
  assert.equal(summary.matured, 0);
  assert.equal(summary.averageReturnPct, null);
  assert.equal(summary.averageProfitPct, null);
  assert.equal(summary.averageLossPct, null);
});
