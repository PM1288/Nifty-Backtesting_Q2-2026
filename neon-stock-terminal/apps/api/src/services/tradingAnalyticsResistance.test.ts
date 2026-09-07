import test from "node:test";
import assert from "node:assert/strict";
import { resistanceViews } from "./tradingAnalyticsResistance";
const rows = [
  {
    date: "2026-09-01",
    open: 110,
    close: 100,
    high: 112,
    low: 99,
    created_at: "2026-09-02T00:00:00Z",
  },
  {
    date: "2026-09-02",
    open: 105,
    close: 101,
    high: 111,
    low: 100,
    created_at: "2026-09-03T00:00:00Z",
  },
];
test("daily weekly lookbacks are not silently invented", () => {
  const r = resistanceViews(rows, "2026-09-04T00:00:00Z", 102);
  assert.equal(r[0].state, "LOOKBACK_REQUIRED");
  assert.equal(r[1].state, "LOOKBACK_REQUIRED");
  assert.equal(r[2].lookback, 12);
  assert.equal(r[2].state, "DATA_INSUFFICIENT");
});
test("resistance reuses largest bearish open and ignores later wick breaks", () => {
  const r = resistanceViews(rows, "2026-09-04T00:00:00Z", 102, 2);
  assert.equal(r[0].selected?.resistance, 110);
});
test("closed break stays broken; unavailable observations cannot confirm R", () => {
  const r = resistanceViews(
    [
      ...rows,
      {
        date: "2026-09-03",
        open: 101,
        close: 111,
        high: 111,
        low: 100,
        created_at: "2026-09-04T00:00:00Z",
      },
    ],
    "2026-09-05T00:00:00Z",
    100,
    3,
  );
  assert.equal(r[0].selected, null);
  assert.equal(
    resistanceViews(rows, "2026-09-02T12:00:00Z", 100, 2)[0].state,
    "DATA_INSUFFICIENT",
  );
});
