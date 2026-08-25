import assert from "node:assert/strict";
import test from "node:test";

import { buildHeaderStockTickerTape } from "./overview.js";

test("header ticker contains stock quotes and never repeats index context", () => {
  const ticker = buildHeaderStockTickerTape([
    { symbol: "IDEA", last: 15.25, change_pct: 8.54, timestamp: "2026-08-25T10:00:00Z" },
    { symbol: "OFSS", last: 11_729, change_pct: 1.08, timestamp: "2026-08-25T10:00:00Z" },
    { symbol: "NIFTY50", last: 24_142.55, change_pct: -0.32, timestamp: "2026-08-25T10:00:00Z" },
    { symbol: "INDIAVIX", last: 12.5, change_pct: 2.1, timestamp: "2026-08-25T10:00:00Z" }
  ]);

  assert.deepEqual(ticker, [
    { symbol: "IDEA", last: 15.25, changePct: 8.54 },
    { symbol: "OFSS", last: 11_729, changePct: 1.08 }
  ]);
});
