import assert from "node:assert/strict";
import test from "node:test";

import { buildHeaderStockTickerTape, getScalperProgression } from "./overview.js";

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

test("home scalper progression preserves period references, zero and missingness", async () => {
  const payload = await getScalperProgression({
    $queryRaw: async () => [{
      symbol: "TEST",
      current_value: "125.50",
      today_open: 120,
      current_week_open: 118,
      previous_week_open: 115,
      current_month_open: 110,
      previous_month_close: 0,
      two_months_ago_close: null,
      observed_at: "2026-09-11T03:15:00Z",
    }],
  } as never);

  assert.equal(payload.scope, "CURRENT_NSE_STOCK_FNO_UNIVERSE");
  assert.deepEqual(payload.rows, [{
    symbol: "TEST",
    currentValue: 125.5,
    todayOpen: 120,
    currentWeekOpen: 118,
    previousWeekOpen: 115,
    currentMonthOpen: 110,
    previousMonthClose: 0,
    twoMonthsAgoClose: null,
    observedAt: "2026-09-11T03:15:00.000Z",
  }]);
});
