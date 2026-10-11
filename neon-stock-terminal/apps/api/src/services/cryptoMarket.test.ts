import { test } from "node:test";
import assert from "node:assert/strict";
import { createCryptoMarket, parseCryptoCandles, CRYPTO_INTERVAL_MS as step } from "./cryptoMarket";
const kline = (time: number) => [time, "100", "110", "90", "105", "12.5", time + step - 1, "1300.25", 42, "0", "0", "0"];

test("Binance OHLC, actual base/quote volume and trades remain exact; forming candles are excluded", () => {
  const bars = parseCryptoCandles([kline(step), kline(0), kline(step), kline(2 * step)], 2 * step);
  assert.equal(bars.length, 2);
  assert.deepEqual(bars[0], { openTime: 0, closeTime: step - 1, open: 100, high: 110, low: 90, close: 105, volumeCoin: 12.5, volumeUsdt: 1300.25, tradeCount: 42 });
});

test("Missing, malformed and impossible observations are rejected instead of rendered as zero", () => {
  for (const value of [null, {}, [[0]], [[0, null, 110, 90, 105, 12, step - 1, 1300, 42]], [[0, 100, 99, 90, 105, 12, step - 1, 1300, 42]], [[0, 100, 110, 90, 105, -1, step - 1, 1300, 42]]]) {
    assert.throws(() => parseCryptoCandles(value, 2 * step));
  }
});

test("Concurrent browser reads share six upstream calls and refresh at the next completed boundary", async () => {
  let now = 4 * step + 5000, calls = 0;
  const fetcher = (async (url: string | URL | Request) => {
    calls++;
    const parsed = new URL(String(url));
    assert.equal(parsed.hostname, "data-api.binance.vision");
    assert.equal(parsed.searchParams.get("interval"), "5m");
    assert.equal(parsed.searchParams.get("limit"), "1000");
    const end = Number(parsed.searchParams.get("endTime")) + 1;
    return new Response(JSON.stringify([kline(end - step)]), { status: 200 });
  }) as typeof fetch;
  const read = createCryptoMarket(fetcher, () => now);
  const [a, b] = await Promise.all([read(), read()]);
  assert.equal(calls, 6); assert.equal(a.markets.length, 6); assert.ok(b.markets.every(m => m.state === "READY"));
  await read(); assert.equal(calls, 6);
  now += step; await read(); assert.equal(calls, 12);
});

test("A failed pair does not hide healthy pairs; stale fallback keeps original timestamps", async () => {
  let now = 4 * step + 5000, fail = false;
  const read = createCryptoMarket((async (url: string | URL | Request) => {
    if (fail && String(url).includes("BTCUSDT")) throw new Error("network");
    return new Response(JSON.stringify([kline(Math.floor(now / step) * step - step)]));
  }) as typeof fetch, () => now);
  const initial = await read();
  now += step; fail = true;
  const updated = await read();
  assert.equal(updated.markets[0].state, "STALE");
  assert.equal(updated.markets[0].fetchedAt, initial.markets[0].fetchedAt);
  assert.equal(updated.markets[1].state, "READY");
});

test("Missing candles are marked partial, unavailable sources stay empty, rate limits back off", async () => {
  let calls = 0;
  const read = createCryptoMarket((async () => { calls++; return new Response("{}", { status: 429, headers: { "Retry-After": "120" } }); }) as typeof fetch, () => 4 * step + 5000);
  const first = await read();
  assert.ok(first.markets.every(m => m.state === "UNAVAILABLE" && m.bars.length === 0));
  const previous = calls; await read(); assert.equal(calls, previous);
  const partial = createCryptoMarket((async () => new Response(JSON.stringify([kline(step), kline(3 * step)]))) as typeof fetch, () => 4 * step + 5000);
  const data = await partial(); assert.equal(data.markets[0].missingIntervals, 1); assert.equal(data.markets[0].state, "PARTIAL");
});
