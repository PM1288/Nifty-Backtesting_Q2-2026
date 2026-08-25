import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PAPER_CONTEXT,
  PAPER_METRIC_DEFINITIONS,
  paperMetricById,
  paperValueState,
  parsePaperWorkbenchContext,
  serializePaperWorkbenchContext,
} from "../src/lib/paperWorkbench";

test("paper accounting registry distinguishes every required accounting class", () => {
  const classes = new Set(Object.values(PAPER_METRIC_DEFINITIONS).map((item) => item.accountingClass));
  assert.deepEqual([...classes].sort(), ["BOOKED", "DATA_QUALITY", "HYPOTHETICAL", "OBSERVED", "OPEN_ACTUAL", "SIMULATED"].sort());
  assert.equal(paperMetricById("booked_realised_net")?.costBasis, "NET");
  assert.equal(paperMetricById("open_unrealised_gross")?.costBasis, "GROSS");
  assert.equal(paperMetricById("intraday_max_profit")?.unit, "INR");
  assert.equal(paperMetricById("intraday_max_profit")?.precision, 2);
  assert.equal(paperMetricById("mfe_30d")?.unit, "PERCENT");
});

test("zero remains a real paper value while absent values remain missing", () => {
  assert.equal(paperValueState(0), "AVAILABLE_ZERO");
  assert.equal(paperValueState("0"), "AVAILABLE_ZERO");
  assert.equal(paperValueState(-12.5), "AVAILABLE");
  assert.equal(paperValueState(null), "MISSING");
  assert.equal(paperValueState(undefined), "MISSING");
  assert.equal(paperValueState("not observed"), "MISSING");
});

test("workbench context round trips through shareable URL state", () => {
  const parsed = parsePaperWorkbenchContext(new URLSearchParams("section=reward-pain&period=30D&strategy=RSI_WILLR&status=OPEN&direction=SELL&horizon=30D&accounting=OBSERVED&capital=FIXED_2L&basis=GROSS"));
  assert.equal(parsed.section, "reward-pain");
  assert.equal(parsed.direction, "SELL");
  assert.equal(parsed.accounting, "OBSERVED");
  assert.equal(parsePaperWorkbenchContext(serializePaperWorkbenchContext(parsed)).strategy, "RSI_WILLR");
});

test("default workbench context does not pollute existing route parameters", () => {
  const params = serializePaperWorkbenchContext(DEFAULT_PAPER_CONTEXT, new URLSearchParams("tradeId=pt_123"));
  assert.equal(params.toString(), "tradeId=pt_123");
});
