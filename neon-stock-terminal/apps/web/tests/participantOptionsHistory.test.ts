import assert from "node:assert/strict";
import test from "node:test";
import { buildParticipantOptionsHistory } from "../src/lib/participantOptionsHistory";

test("participant options history plots one current value per participant and report date", () => {
  const model = buildParticipantOptionsHistory([
    { trade_date: "2026-09-09", client_type: "FII", net_calls: -20 },
    { trade_date: "2026-09-09", client_type: "Pro", net_calls: 10 },
    { trade_date: "2026-09-10", client_type: "FII", net_calls: 0 },
    { trade_date: "2026-09-10", client_type: "Pro", net_calls: 30 },
  ], "net_calls");
  assert.deepEqual(model.dates, ["2026-09-09", "2026-09-10"]);
  assert.deepEqual(model.series[0], { participant: "FII", label: "FII", values: [-20, 0] });
  assert.deepEqual(model.series[1], { participant: "Pro", label: "Pro", values: [10, 30] });
  assert.equal(model.observedCount, 4);
  assert.equal(model.expectedCount, 8);
});

test("participant options history preserves report gaps and excludes TOTAL reconciliation", () => {
  const model = buildParticipantOptionsHistory([
    { trade_date: "2026-09-09", client_type: "FII", options_proxy: 10 },
    { trade_date: "2026-09-10", client_type: "FII", options_proxy: null },
    { trade_date: "2026-09-10", client_type: "Client", options_proxy: "25" },
    { trade_date: "2026-09-10", client_type: "TOTAL", options_proxy: 999 },
  ], "options_proxy");
  assert.deepEqual(model.series[0].values, [10, null]);
  assert.deepEqual(model.series[2].values, [null, 25]);
  assert.equal(model.observedCount, 2);
});
