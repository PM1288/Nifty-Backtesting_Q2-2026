import assert from "node:assert/strict";
import test from "node:test";
import { buildPaperParallelRows, minimumOneAxisScale, paperParallelAxes } from "../src/lib/paperParallelPlot";

const trade = {
  trade_group_id: "paper-1",
  symbol: "ABC",
  side: "BUY",
  entry_strategy: "OIIS_RSI_WILLIAMS",
  average_entry_price: 100,
  opened_quantity: 200,
  fixed_investment_quantity: 2000,
  evidence_reference_price: 99,
  evidence_ofactor: 75,
  evidence_xfactor: 81,
  evidence_rsi14: 63,
  evidence_atr14: 4.5,
  evidence_willr14: -24,
  evidence_volume_ratio: 1.6,
  intraday_max_profit: 300,
  fixed_investment_mfe_5d_pnl: 5200,
  fixed_investment_mfe_30d_pnl: 9100,
  targets: [{ lifecycle: "SWING", status: "HIT", target_price: 103 }],
};

test("parallel evidence includes every requested entry and outcome dimension", () => {
  const row = buildPaperParallelRows([trade])[0];
  assert.deepEqual(paperParallelAxes.map((axis) => axis.id), [
    "O_FACTOR", "X_FACTOR", "RSI14", "ATR14", "WILLIAMS14", "RELATIVE_VOLUME",
    "ENTRY_PRICE", "ENTRY_VS_REFERENCE", "INTRADAY_MAX_PROFIT", "SWING_TARGET_PROFIT",
    "FIVE_DAY_MAX_PROFIT", "THIRTY_DAY_MAX_PROFIT",
  ]);
  assert.equal(row.values.INTRADAY_MAX_PROFIT, 3000);
  assert.equal(row.values.SWING_TARGET_PROFIT, 6000);
  assert.equal(row.values.FIVE_DAY_MAX_PROFIT, 5200);
  assert.equal(row.values.THIRTY_DAY_MAX_PROFIT, 9100);
});

test("paper chart axis ticks never use an interval below one", () => {
  assert.equal(minimumOneAxisScale([0.1, 0.3, 0.8]).step, 1);
  assert.ok(minimumOneAxisScale([-2.2, 8.1]).step >= 1);
  assert.ok(minimumOneAxisScale([40, 80], [0, 100]).step >= 1);
});

test("missing evidence remains missing instead of becoming zero", () => {
  const row = buildPaperParallelRows([{ ...trade, evidence_atr14: null, fixed_investment_mfe_30d_pnl: null }])[0];
  assert.equal(row.values.ATR14, null);
  assert.equal(row.values.THIRTY_DAY_MAX_PROFIT, null);
});
