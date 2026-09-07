import test from "node:test";
import assert from "node:assert/strict";
import { oiTimeline } from "../src/lib/tradingAnalyticsOiTimeline";
test("OI rendering separates gaps without losing zero or source samples", () => {
  const p = oiTimeline([
    { event_time: "2026-09-07T04:00:00Z", oi: "0" },
    { event_time: "2026-09-07T04:15:00Z", oi: "20" },
    { event_time: "2026-09-08T04:00:00Z", oi: "30" },
  ]);
  assert.deepEqual(
    p.map((x) => x[1]),
    [0, 20, null, 30],
  );
});
test("missing OI is not zero and invalid timestamps are not fabricated", () =>
  assert.deepEqual(
    oiTimeline([
      { event_time: "bad", oi: 10 },
      { event_time: "2026-09-07T04:00:00Z", oi: null },
    ]),
    [["2026-09-07T04:00:00Z", null]],
  ));
