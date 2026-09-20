import assert from "node:assert/strict";
import test from "node:test";
import { buildHeaderTodayOutlook, formatCrore, outlookTone } from "../src/components/chrome/headerTodayOutlook";

test("header outlook shows the three exact FII values and canonical result", () => {
  const view = buildHeaderTodayOutlook({
    asOf: "2026-09-20T04:00:00Z",
    reportDate: "2026-09-19",
    derivativesReportDate: "2026-09-19",
    cashReportDate: "2026-09-18",
    equity: "Sell",
    futures: "Buy",
    options: "Buy",
    equityNet: "-125.50",
    futuresNet: "264.47",
    optionsNet: "4404.77",
    matrix: "Sideways (Bullish)",
    knowledgeState: "CASH_PUBLICATION_TIME_UNVERIFIED",
  });
  assert.equal(view.equityValue, "-125.50");
  assert.equal(view.futuresValue, "+264.47");
  assert.equal(view.optionsValue, "+4,404.77");
  assert.equal(view.result, "Sideways (Bullish)");
  assert.equal(view.tone, "positive");
  assert.equal(view.cashReport, "2026-09-18");
  assert.match(view.title, /derivatives 2026-09-19 · cash 2026-09-18/i);
  assert.match(view.title, /all indices, not NIFTY only/i);
  assert.match(view.title, /not premium cash flow/i);
});

test("header outlook does not represent missing activity as zero", () => {
  const view = buildHeaderTodayOutlook(undefined);
  assert.equal(view.equity, "—");
  assert.equal(view.equityValue, "—");
  assert.equal(view.result, "Data unavailable");
  assert.equal(view.tone, "neutral");
  assert.equal(formatCrore(null), "—");
});

test("all original matrix labels map to an honest visual tone", () => {
  for (const label of ["Super Bullish", "Bullish", "Sideways (Bullish)"]) assert.equal(outlookTone(label), "positive");
  for (const label of ["Super Bearish", "Bearish", "Sideways (Bearish)"]) assert.equal(outlookTone(label), "negative");
  assert.equal(outlookTone("INSUFFICIENT_DATA"), "neutral");
});
