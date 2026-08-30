import assert from "node:assert/strict";
import test from "node:test";
import {
  filterTrackedStocks,
  trackedHistoryRows,
  trackedStocksCsv,
  type AiTrackedStock,
} from "../src/lib/paperTrackedStocks";

const stocks: AiTrackedStock[] = ["SBIN", "INFY", "RELIANCE"].map((symbol, index) => ({
  evaluationId: `evaluation-${index}`,
  tradeDate: "2026-08-31",
  symbol,
  companyName: `${symbol} Limited`,
  exchange: "NSE",
  direction: index === 2 ? "SHORT" : "LONG",
  strategyStatus: index === 0 ? "BUY NOW" : "WATCH",
  ofactor: index === 1 ? 0 : 78.5,
  xfactor: 75.25,
  referencePrice: 100,
  sourceDataThrough: "2026-08-28",
  historySessionCount: 248,
  evaluationStatus: "COMPLETED",
  discoveredAt: "2026-08-31T04:00:00.000Z",
  completedAt: "2026-08-31T04:02:00.000Z",
  sources: [{ strategy: index === 2 ? "OISS" : "OIIS", slot: "OPEN_0930" }],
  providers: {
    CLAUDE: {
      provider: "CLAUDE", model: "Sonnet 5", status: "SUCCEEDED", verdict: "WAIT",
      confidence: 72, newsSignal: "MIXED", summary: "Wait for confirmation.",
      technicalView: "Price is consolidating.", fundamentalView: "Earnings are stable.",
      keyDriver: "Current filing.", keyRisk: "Event risk.", entryView: "Wait.",
      invalidation: "Evidence weakens.", evidence: [], completedAt: null,
      durationMs: 1000, errorClass: null, deliveryStatus: "DELIVERED",
    },
  },
  inputSnapshot: {
    price_history_1y: {
      columns: ["date", "open", "high", "low", "close", "volume"],
      rows: [["2026-08-28", 98, 102, 97, 100, 1000]],
    },
  },
}));

test("compact one-year OHLCV is decoded without repeating field names per session", () => {
  assert.deepEqual(trackedHistoryRows(stocks[0]!.inputSnapshot), [{
    date: "2026-08-28", open: 98, high: 102, low: 97, close: 100, volume: 1000,
  }]);
});

test("tracked-stock filtering searches identity, strategy and AI conclusions", () => {
  assert.equal(filterTrackedStocks(stocks, "").length, 3);
  assert.deepEqual(filterTrackedStocks(stocks, "OISS").map((stock) => stock.symbol), ["RELIANCE"]);
  assert.equal(filterTrackedStocks(stocks, "event risk").length, 3);
  assert.equal(filterTrackedStocks(stocks, "short").length, 1);
});

test("tracked-stock CSV exports every stock and keeps numeric zero distinct from missing", () => {
  const csv = trackedStocksCsv(stocks);
  assert.match(csv, /"SBIN"/);
  assert.match(csv, /"INFY"/);
  assert.match(csv, /"RELIANCE"/);
  assert.match(csv, /"0"/);
  assert.match(csv, /"claude_verdict"/);
  assert.match(csv, /"claude_technical_view"/);
  assert.match(csv, /"Earnings are stable\."/);
  assert.equal(csv.split("\n").length, 4);
});
