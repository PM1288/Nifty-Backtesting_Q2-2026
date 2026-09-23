import { test } from "node:test";
import assert from "node:assert/strict";
import {
  atomicChainState,
  loadSmartApiNifty,
  smartApiQuoteState,
  observedOiChange,
} from "./tradingAnalyticsSmartApi";
test("native atomic chain cadence distinguishes current, stale and future snapshots", () => {
  assert.equal(atomicChainState("2026-09-07T05:57:00Z", "2026-09-07T06:00:00Z", null), "OBSERVED");
  assert.equal(atomicChainState("2026-09-07T05:56:59Z", "2026-09-07T06:00:00Z", null), "STALE");
  assert.equal(atomicChainState("2026-09-07T06:00:01Z", "2026-09-07T06:00:00Z", null), "INVALID_FUTURE_TIMESTAMP");
});
test("OI difference preserves zero, negative and missing and is not option delta",()=>{
  assert.equal(observedOiChange("100","150"),-50);
  assert.equal(observedOiChange(0,0),0);
  assert.equal(observedOiChange(null,100),null);
  assert.equal(observedOiChange(100,null),null);
});
test("Greeks match expiry-scoped strike and right and preserve comparable IV change",async()=>{
  const result=await loadSmartApiNifty(async source=>source==="smartapi_spot"?[{ltp:23800}]:source==="smartapi_expiries"?[{expiry:"2026-09-08"}]:source==="smartapi_contracts"?[{strike:23800,option_type:"CE",open_interest:"100",previous_open_interest:"150"},{strike:23800,option_type:"PE",open_interest:0}]:source==="smartapi_greeks"?[{strike:23800,option_type:"CE",delta:0.52,implied_volatility:18.25,previous_implied_volatility:17.5,greeks_collected_at:"2026-09-07T05:59:00Z",previous_greeks_collected_at:"2026-09-07T05:54:00Z"},{strike:25250,option_type:"PE",delta:-0.87}]:[],"2026-09-07T06:00:00Z");
  assert.equal(result.legs[0].delta,0.52);
  assert.equal(result.legs[0].previous_snapshot_delta,-50);
  assert.equal(result.legs[0].change_in_oi,null);
  assert.equal(result.legs[0].change_in_iv,0.75);
  assert.equal(result.legs[0].previous_implied_volatility,17.5);
  assert.equal(result.legs[1].delta,null);
  assert.equal(result.legs[1].change_in_iv,null);
  assert.equal(result.legs[1].previous_snapshot_delta,null);
});
test("fallback chain metric legs receive the same exact-contract IV and Greeks enrichment", async () => {
  const result = await loadSmartApiNifty(async source => source === "smartapi_spot"
    ? [{ ltp: 23800 }]
    : source === "smartapi_expiries"
      ? [{ expiry: "2026-09-08" }]
      : source === "smartapi_contracts"
        ? [{ strike: 23800, option_type: "CE", open_interest: null }, { strike: 23800, option_type: "PE", open_interest: null }]
        : source === "smartapi_stock_chain"
          ? [{ strike: 23800, option_type: "CE", open_interest: "120", implied_volatility: 18 }, { strike: 23800, option_type: "PE", open_interest: "140", implied_volatility: 19, previous_implied_volatility: 18.5 }]
          : source === "smartapi_greeks"
            ? [{ strike: 23800, option_type: "CE", implied_volatility: 18.75, previous_implied_volatility: 18.25, delta: 0.52, gamma: 0.001, theta: -8, vega: 4 }]
            : [], "2026-09-07T06:00:00Z");
  const call = result.metricLegs.find((leg) => leg.option_type === "CE");
  const put = result.metricLegs.find((leg) => leg.option_type === "PE");
  assert.equal(call?.change_in_iv, 0.5);
  assert.equal(call?.delta, 0.52);
  assert.equal(call?.gamma, 0.001);
  assert.equal(put?.implied_volatility, 19);
  assert.equal(put?.change_in_iv, 0.5);
});

test("fallback chain IV baseline is exact-token, prior and as-of bounded", async () => {
  let fallbackSql = "";
  await loadSmartApiNifty(async (source, sql) => {
    if (source === "smartapi_spot") return [{ ltp: 23800 }];
    if (source === "smartapi_expiries") return [{ expiry: "2026-09-08" }];
    if (source === "smartapi_contracts") return [{ strike: 23800, option_type: "CE", open_interest: null }];
    if (source === "smartapi_stock_chain") fallbackSql = sql;
    return [];
  }, "2026-09-07T06:00:00Z");
  assert.match(fallbackSql, /p\.symbol_token=c\.symbol_token/);
  assert.match(fallbackSql, /p\.ts<c\.ts/);
  assert.match(fallbackSql, /p\.ts BETWEEN \$1::timestamptz-interval '7 days' AND \$1::timestamptz/);
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
test("fresh atomic chain cohort replaces stale individually timed FULL OI quotes", async () => {
  const result = await loadSmartApiNifty(async (source) => {
    if (source === "smartapi_spot") return [{ ltp: 23800 }];
    if (source === "smartapi_expiries") return [{ expiry: "2026-09-08" }];
    if (source === "smartapi_contracts") return [
      { strike: 23800, option_type: "CE", open_interest: "100", exchange_feed_at: "2026-09-07T05:30:00Z" },
      { strike: 23800, option_type: "PE", open_interest: "110", exchange_feed_at: "2026-09-07T05:30:00Z" },
    ];
    if (source === "smartapi_stock_chain") return [
      { strike: 23800, option_type: "CE", open_interest: "200", exchange_feed_at: "2026-09-07T05:59:30Z", collected_at: "2026-09-07T05:59:35Z" },
      { strike: 23800, option_type: "PE", open_interest: "220", exchange_feed_at: "2026-09-07T05:59:30Z", collected_at: "2026-09-07T05:59:35Z" },
    ];
    return [];
  }, "2026-09-07T06:00:00Z");
  assert.equal(result.source, "smartapi_option_chain_snapshots");
  assert.deepEqual(result.legs.map((leg) => leg.open_interest), ["200", "220"]);
  assert.ok(result.legs.every((leg) => leg.quote_state === "OBSERVED"));
});
test("native NSE chain is the canonical current OI and reported delta OI cohort", async () => {
  const result = await loadSmartApiNifty(async (source) => {
    if (source === "smartapi_spot") return [{ ltp: 23800 }];
    if (source === "smartapi_expiries") return [{ expiry: "2026-09-08" }];
    if (source === "smartapi_contracts") return [
      { strike: 23800, option_type: "CE", open_interest: "100", exchange_feed_at: "2026-09-07T05:59:30Z" },
      { strike: 23800, option_type: "PE", open_interest: "110", exchange_feed_at: "2026-09-07T05:59:30Z" },
    ];
    if (source === "nse_option_chain") return [
      { strike: 23800, option_type: "CE", open_interest: "200", change_in_oi: "40", collected_at: "2026-09-07T05:58:30Z" },
      { strike: 23800, option_type: "PE", open_interest: "220", change_in_oi: "-20", collected_at: "2026-09-07T05:58:30Z" },
    ];
    return [];
  }, "2026-09-07T06:00:00Z");
  assert.equal(result.source, "nse_option_chain_snapshots");
  assert.deepEqual(result.legs.map((leg) => leg.open_interest), ["200", "220"]);
  assert.deepEqual(result.legs.map((leg) => {
    const layers = leg.oi_layers as Record<string, unknown>;
    return {
      current: layers.current,
      baseline: layers.baseline,
      change: layers.change,
      state: layers.state,
    };
  }), [
    { current: 200, baseline: 160, change: 40, state: "COMPARABLE" },
    { current: 220, baseline: 240, change: -20, state: "COMPARABLE" },
  ]);
  assert.equal(result.oiAnalytics.fixedCohort.unit, "contracts");
  assert.equal(result.metrics.collectedAt, "2026-09-07T05:58:30Z");
  assert.equal(result.oiAnalytics.baselinePreference[0], "PROVIDER_REPORTED_CHANGE");
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

test("SmartAPI option baselines bound collection time for partition pruning", async () => {
  let contractSql = "";
  await loadSmartApiNifty(
    async (source, sql) => {
      if (source === "smartapi_spot") return [{ ltp: 23800 }];
      if (source === "smartapi_expiries") return [{ expiry: "2026-09-15" }];
      if (source === "smartapi_contracts") contractSql = sql;
      return [];
    },
    "2026-09-10T08:50:00Z",
  );
  assert.match(contractSql, /p\.ts BETWEEN \$1::timestamptz-interval '1 day' AND \$1::timestamptz/);
  assert.match(contractSql, /p\.ts BETWEEN previous_day\.market_open_ts-interval '1 day' AND \$1::timestamptz/);
  assert.match(contractSql, /p\.exch_feed_time BETWEEN previous_day\.market_open_ts AND previous_day\.market_close_ts/);
});
