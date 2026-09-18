import assert from "node:assert/strict";
import test from "node:test";
import { researchCsv, researchExcel, researchMarkdown, researchTables } from "../src/lib/paperResearchExport";
const report = { as_of: "2026-09-18T10:00Z", generated_at: "2026-09-18", parameters: { fees_bps: 0 }, source: [{ trade_leg_id: "id", symbol: "=FORMULA", side: "SELL", verified: { horizons: [{ status: "CENSORED" }], opportunities: [] }, monthly: { reason: "NO_MONTHLY_CANDIDATE" }, monthly_known: { included: false, reason: "NO_MONTHLY_CANDIDATE" } }], cohorts: [{ id: "ALL", label: "All", scenarios: [{ allocation: 200000, taken: 1, skipped: 0, ending_equity: 399000, return_pct: -.25, max_sampled_drawdown: 1000, positions: [], equity_events: [], decisions: [] }] }], journeys: [], monthly_candidates: [], limitations: ["No fills inferred"] };
test("workbook has all evidence lanes, signed numbers and no fake xlsx", () => {
  const xml = researchExcel(report);
  assert.ok(xml.startsWith('<?xml version="1.0"?>'));
  assert.ok(xml.includes('Worksheet ss:Name="Monthly evidence"'));
  assert.ok(xml.includes('ss:Type="Number">-0.25'));
  assert.equal(researchTables(report).length, 12);
  assert.ok(researchCsv(report).includes("'=FORMULA"));
});
test("Markdown includes capital basis, methodology and monthly exclusion reasons", () => {
  const text = researchMarkdown(report);
  assert.ok(text.includes("₹4 lakh")); assert.ok(text.includes("NO_MONTHLY_CANDIDATE")); assert.ok(text.includes("No fills inferred"));
});
