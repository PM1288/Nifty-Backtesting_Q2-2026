import assert from "node:assert/strict";
import test from "node:test";
import {
  PAPER_EVIDENCE_COLUMN_WIDTHS,
  PAPER_EVIDENCE_DENSITIES,
  PAPER_EVIDENCE_PRESETS,
  PAPER_EVIDENCE_ROW_HEIGHTS,
  PAPER_EVIDENCE_SLOTS,
} from "../src/lib/paperEvidenceGeometry";

test("paper evidence cells keep a five-slot baseline contract", () => {
  assert.deepEqual(PAPER_EVIDENCE_SLOTS, ["primary", "secondary", "detail", "supporting", "metadata"]);
});

test("density changes geometry without changing presets or columns", () => {
  assert.deepEqual(PAPER_EVIDENCE_ROW_HEIGHTS, { dense: 82, comfortable: 98, audit: 112 });
  assert.deepEqual(PAPER_EVIDENCE_DENSITIES, ["COMFORTABLE", "DENSE", "AUDIT"]);
  assert.deepEqual(PAPER_EVIDENCE_PRESETS, ["ALL", "EXECUTION", "TARGETS", "HORIZON", "RISK", "QUALITY"]);
  assert.equal(Object.keys(PAPER_EVIDENCE_COLUMN_WIDTHS).length, 13);
  assert.equal(PAPER_EVIDENCE_COLUMN_WIDTHS.trade + PAPER_EVIDENCE_COLUMN_WIDTHS.direction, 320);
});

test("financial and target columns have deterministic semantic widths", () => {
  assert.equal(PAPER_EVIDENCE_COLUMN_WIDTHS.capital, 170);
  assert.equal(PAPER_EVIDENCE_COLUMN_WIDTHS.economics, 150);
  assert.equal(PAPER_EVIDENCE_COLUMN_WIDTHS.target, 105);
  assert.equal(PAPER_EVIDENCE_COLUMN_WIDTHS.rewardPain, 130);
});
