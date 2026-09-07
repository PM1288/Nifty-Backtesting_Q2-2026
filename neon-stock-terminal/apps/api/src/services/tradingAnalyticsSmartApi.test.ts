import { test } from "node:test";
import assert from "node:assert/strict";
import {
  loadSmartApiNifty,
  smartApiQuoteState,
  observedOiChange,
} from "./tradingAnalyticsSmartApi";
test("OI difference preserves zero, negative and missing and is not option delta",()=>{
  assert.equal(observedOiChange("100","150"),-50);
  assert.equal(observedOiChange(0,0),0);
  assert.equal(observedOiChange(null,100),null);
  assert.equal(observedOiChange(100,null),null);
});
test("Greeks match expiry-scoped strike and right, never another leg",async()=>{
  const result=await loadSmartApiNifty(async source=>source==="smartapi_spot"?[{ltp:23800}]:source==="smartapi_expiries"?[{expiry:"2026-09-08"}]:source==="smartapi_contracts"?[{strike:23800,option_type:"CE",open_interest:"100",previous_open_interest:"150"},{strike:23800,option_type:"PE",open_interest:0}]:source==="smartapi_greeks"?[{strike:23800,option_type:"CE",delta:0.52,greeks_collected_at:"2026-09-07T05:59:00Z"},{strike:25250,option_type:"PE",delta:-0.87}]:[],"2026-09-07T06:00:00Z");
  assert.equal(result.legs[0].delta,0.52);
  assert.equal(result.legs[0].previous_snapshot_delta,-50);
  assert.equal(result.legs[0].change_in_oi,null);
  assert.equal(result.legs[1].delta,null);
  assert.equal(result.legs[1].previous_snapshot_delta,null);
});
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
