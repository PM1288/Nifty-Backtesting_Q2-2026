import assert from "node:assert/strict";
import test from "node:test";
import { backtestingLabTestExports } from "./backtestingLab";

test("canonical request hashes do not depend on object key order", () => {
  const left = backtestingLabTestExports.hashRequest({ b: 2, a: { d: 4, c: 3 } });
  const right = backtestingLabTestExports.hashRequest({ a: { c: 3, d: 4 }, b: 2 });
  assert.equal(left, right);
});

test("parameter validation rejects unknown and unsafe levels", () => {
  assert.throws(
    () => backtestingLabTestExports.validateParameters("rsi30_willr80_closegtprev_tp125_v1", { shell: true }),
    /Unknown parameters/
  );
  assert.throws(
    () => backtestingLabTestExports.validateParameters("rsi30_willr80_closegtprev_tp125_v1", { rsiMax: 101 }),
    /outside/
  );
});

test("strict create contract rejects arbitrary request fields and accepts bounded research mode", () => {
  const base = {
    schemaVersion: "1.0",
    strategyVersionId: "rsi30_willr80_closegtprev_tp125_v1",
    dateStart: "2026-01-01",
    dateEnd: "2026-02-01",
    universe: { mode: "single_stock", symbols: ["RELIANCE"] },
    parameters: { rsiMax: 30, willrMax: -80 },
    capital: { mode: "no_capital_limit", startingCapital: null, ticketSize: null, maxPositions: null }
  };
  assert.equal(backtestingLabTestExports.createRunSchema.safeParse(base).success, true);
  assert.equal(backtestingLabTestExports.createRunSchema.safeParse({ ...base, command: "rm -rf" }).success, false);
});
