import assert from "node:assert/strict";
import test from "node:test";
import {
  formatDecimal,
  formatNumber,
  formatPercent,
  formatUiValue,
  roundUiNumericData
} from "../src/lib/format";
import {
  formatChartNumber,
  normalizeChartAxisFormatter,
  roundChartData,
  sanitizeChartDecimalText
} from "../src/components/visual/chartPrecision";

test("shared UI formatters never render more than two decimal places", () => {
  assert.equal(formatNumber(1234.56789, { maximumFractionDigits: 5 }, "en-IN"), "1,234.57");
  assert.equal(formatNumber(1.2, { minimumFractionDigits: 4, maximumFractionDigits: 4 }, "en-IN"), "1.20");
  assert.equal(formatDecimal(1.23456, 4, "en-IN"), "1.23");
  assert.equal(formatPercent(1.23456, 4, false, "en-IN"), "1.23%");
  assert.equal(formatUiValue(48.819), "48.82");
  assert.deepEqual(roundUiNumericData({ pnl: 1034204.9668, nested: [24.7127] }), {
    pnl: 1034204.97,
    nested: [24.71]
  });
});

test("chart values and custom labels are rounded to two decimals", () => {
  assert.equal(formatChartNumber(98.7654), "98.77");
  assert.equal(sanitizeChartDecimalText("IV 18.4567% · OI 12,345.6789"), "IV 18.46% · OI 12,345.68");
  assert.deepEqual(roundChartData([[1.2345, 9.8765], { value: 3.14159, name: "x" }]), [
    [1.23, 9.88],
    { value: 3.14, name: "x" }
  ]);

  const formatter = normalizeChartAxisFormatter((value: number) => `${value.toFixed(4)}%`) as (value: number, index: number) => string;
  assert.equal(formatter(7.8912, 0), "7.89%");
});
