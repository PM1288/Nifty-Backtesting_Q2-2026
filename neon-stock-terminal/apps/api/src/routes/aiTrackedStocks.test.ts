import assert from "node:assert/strict";
import test from "node:test";
import { trackedStocksPayload } from "./aiTrackedStocks";

test("tracked stocks payload preserves three stocks and separate provider results", () => {
  const rows = ["SBIN", "INFY", "RELIANCE"].map((symbol, index) => ({
    evaluation_id: `evaluation-${index}`,
    trade_date: "2026-08-31",
    symbol,
    company_name: `${symbol} Limited`,
    exchange: "NSE",
    direction: "LONG",
    strategy_status: "BUY NOW",
    ofactor: index === 1 ? "0" : "78.50",
    xfactor: "75.25",
    reference_price: "100.00",
    source_data_through: "2026-08-28",
    history_session_count: 30,
    evaluation_status: "COMPLETED",
    discovered_at: "2026-08-31T04:00:00.000Z",
    completed_at: "2026-08-31T04:02:00.000Z",
    sources: [{ strategy: "OIIS", slot: "OPEN_0930" }],
    providers: {
      CLAUDE: { status: "SUCCEEDED", verdict: "WAIT", confidence: 72 },
      QWEN: { status: "DEAD", errorClass: "OutputValidationError" },
      DEEPSEEK: { status: "SUCCEEDED", verdict: "RESEARCH_SUPPORTS_ENTRY", confidence: 81 },
    },
    input_snapshot: { history_30d: [{ date: "2026-08-28", close: 100, volume: 1000 }] },
  }));
  const payload = trackedStocksPayload(rows, "2026-08-31", "2026-08-31");
  assert.equal(payload.count, 3);
  assert.equal(payload.usedLatestSession, false);
  assert.equal(payload.stocks[1]?.ofactor, 0);
  assert.equal((payload.stocks[0]?.providers as Record<string, { verdict: string }>).CLAUDE.verdict, "WAIT");
  assert.equal(payload.stocks[0]?.historySessionCount, 30);
});

test("tracked stocks payload reports latest-session fallback without inventing rows", () => {
  const payload = trackedStocksPayload([], "2026-09-05", "2026-09-04");
  assert.equal(payload.count, 0);
  assert.equal(payload.usedLatestSession, true);
});
