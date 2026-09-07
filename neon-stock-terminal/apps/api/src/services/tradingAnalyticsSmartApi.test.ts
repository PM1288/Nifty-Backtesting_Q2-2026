import { test } from "node:test";
import assert from "node:assert/strict";
import {
  loadSmartApiNifty,
  smartApiQuoteState,
} from "./tradingAnalyticsSmartApi";
test("SmartAPI distinguishes after-close retrieval from live exchange data", () => {
  const close = "2026-09-07T10:10:00Z";
  assert.equal(
    smartApiQuoteState(
      { exchange_feed_at: close },
      "2026-09-07T16:00:00Z",
      close,
    ),
    "SESSION_CLOSED_LAST_QUOTE",
  );
  assert.equal(
    smartApiQuoteState(
      { exchange_feed_at: "2026-09-04T10:10:00Z" },
      "2026-09-07T16:00:00Z",
      close,
    ),
    "STALE",
  );
  assert.equal(
    smartApiQuoteState({}, "2026-09-07T16:00:00Z", close),
    "EXCHANGE_TIME_UNAVAILABLE",
  );
  assert.equal(
    smartApiQuoteState(
      { exchange_feed_at: "2026-09-08T10:10:00Z" },
      "2026-09-07T16:00:00Z",
      close,
    ),
    "INVALID_FUTURE_TIMESTAMP",
  );
});
test("SmartAPI quote age exact threshold and zero OI remain distinct from missing", async () => {
  const asOf = "2026-09-07T06:00:00Z";
  assert.equal(
    smartApiQuoteState(
      { exchange_feed_at: "2026-09-07T05:59:00Z" },
      asOf,
      null,
    ),
    "OBSERVED",
  );
  assert.equal(
    smartApiQuoteState(
      { exchange_feed_at: "2026-09-07T05:58:59Z" },
      asOf,
      null,
    ),
    "STALE",
  );
  const result = await loadSmartApiNifty(
    async (source) =>
      source === "smartapi_spot"
        ? [{ ltp: 23800 }]
        : source === "smartapi_expiries"
          ? [{ expiry: "2026-09-08" }]
          : source === "smartapi_contracts"
            ? [
                {
                  strike: 23800,
                  option_type: "CE",
                  open_interest: "0",
                  total_traded_volume: "0",
                },
                {
                  strike: 23800,
                  option_type: "PE",
                  open_interest: null,
                  total_traded_volume: null,
                },
              ]
            : [],
    asOf,
  );
  assert.equal(result.legs.length, 2);
  assert.equal(result.legs[0].open_interest, "0");
  assert.equal(result.legs[1].open_interest, null);
  assert.equal(result.metrics.oiPcr, null);
  assert.equal(result.shortfall, 9);
});
test("SmartAPI unavailable sources never produce synthetic quotes", async () => {
  const result = await loadSmartApiNifty(
    async () => [],
    "2026-09-07T16:00:00Z",
  );
  assert.deepEqual(result.legs, []);
  assert.equal(result.spot, null);
  assert.equal(result.metrics.oiPcr, null);
});
