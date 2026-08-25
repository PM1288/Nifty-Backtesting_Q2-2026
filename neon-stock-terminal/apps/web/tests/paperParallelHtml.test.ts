import assert from "node:assert/strict";
import test from "node:test";
import { buildStandaloneParallelHtml } from "../src/lib/paperParallelHtml";

test("standalone parallel export embeds data and interaction controls", () => {
  const html = buildStandaloneParallelHtml([{ id: "t1", symbol: "RELIANCE", strategy: "OIIS_LIVE", direction: "LONG", availableDimensions: 1, trade: {}, values: { OFACTOR: 80, XFACTOR: null, RSI: null, WILLIAMS_R: null, ATR: null, RELATIVE_VOLUME: null, ENTRY_PRICE: null, INTRADAY_MAX_PROFIT: null, SWING_TARGET_PROFIT: null, FIVE_DAY_MAX_PROFIT: null, THIRTY_DAY_MAX_PROFIT: null, THIRTY_DAY_MAX_DRAWDOWN: null } }], "2026-08-23T16:00:00+05:30");
  assert.match(html, /<!doctype html>/);
  assert.match(html, /RELIANCE/);
  assert.match(html, /id="strategy"/);
  assert.match(html, /function render\(\)/);
  assert.doesNotMatch(html, /<(script[^>]+src|link[^>]+href)=/i);
});
