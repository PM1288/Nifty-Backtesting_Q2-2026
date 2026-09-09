import test from "node:test";
import assert from "node:assert/strict";
import { SCALPER_ENTRY_RULE, scalperPairedBody80Signals } from "../src/lib/scalperSignals";

const bar = (end: string, open: number, close: number, ema9: number) => ({ end, open, close, ema9, low: Math.min(open, close) - 1, high: Math.max(open, close) + 1, closed: true });
const identity = (tradingsymbol: string, exchange = "NSE", symbol_token = tradingsymbol) => ({ tradingsymbol, exchange, symbol_token });
const t = ["09:25", "09:30", "09:35", "09:40"].map((time) => `2026-09-08T${time}:00+05:30`);

test("paired body80 CALL keeps underlying precursors mandatory and option precursors contextual", () => {
  const panes = [
    { identity: identity("NIFTY 50"), bars: [bar(t[0], 100, 98, 101), bar(t[1], 99, 97, 100), bar(t[2], 99, 109, 101), bar(t[3], 104, 106, 103)] },
    { identity: identity("NIFTY08SEP23600CE", "NFO", "ce"), bars: [bar(t[0], 22, 24, 21), bar(t[1], 21, 23, 20), bar(t[2], 22, 32, 24), bar(t[3], 30, 31, 29)] },
    { identity: identity("NIFTY08SEP23600PE", "NFO", "pe"), bars: [] },
  ];
  const events = scalperPairedBody80Signals(panes, 5);
  assert.equal(events.length, 1);
  assert.equal(events[0].direction, "CALL");
  assert.equal(events[0].underlyingBodyFraction, 0.8);
  assert.equal(events[0].optionBodyFraction, 0.8);
  assert.equal(events[0].optionPremium, 30);
  assert.equal(events[0].state, "RETROSPECTIVE_ENTRY_REFERENCE");
  assert.match(events[0].id, new RegExp(`^${SCALPER_ENTRY_RULE}`));
});

test("paired body80 PUT needs two green above-EMA NIFTY candles and bullish PE reversal", () => {
  const panes = [
    { identity: identity("NIFTY 50"), bars: [bar(t[0], 100, 102, 99), bar(t[1], 101, 103, 100), bar(t[2], 109, 99, 107), bar(t[3], 100, 98, 101)] },
    { identity: identity("NIFTY08SEP23600CE", "NFO", "ce"), bars: [] },
    { identity: identity("NIFTY08SEP23600PE", "NFO", "pe"), bars: [bar(t[0], 24, 22, 25), bar(t[1], 23, 21, 24), bar(t[2], 22, 32, 24), bar(t[3], 31, 33, 30)] },
  ];
  const events = scalperPairedBody80Signals(panes, 5);
  assert.equal(events.length, 1);
  assert.equal(events[0].direction, "PUT");
  assert.equal(events[0].underlyingBodyFraction, 0.8);
  assert.equal(events[0].optionBodyFraction, 0.8);
  assert.equal(events[0].state, "RETROSPECTIVE_ENTRY_REFERENCE");
});

test("rejects missing option confirmation, one precursor, non-consecutive and 79.99 percent", () => {
  const nifty = [bar(t[0], 100, 98, 101), bar(t[1], 99, 97, 100), bar(t[2], 99, 109, 101), bar(t[3], 104, 106, 103)];
  assert.equal(scalperPairedBody80Signals([{ identity: identity("NIFTY 50"), bars: nifty }], 5).length, 0);
  const weakCe = [bar(t[0], 24, 22, 25), bar(t[1], 23, 21, 24), bar(t[2], 22, 32, 24.001), bar(t[3], 30, 31, 29)];
  assert.equal(scalperPairedBody80Signals([{ identity: identity("NIFTY 50"), bars: nifty }, { identity: identity("XCE", "NFO"), bars: weakCe }], 5).length, 0);
  const arbitraryPrecursors = [bar(t[0], 22, 23, 25), bar(t[1], 23, 21, 24), bar(t[2], 22, 32, 24), bar(t[3], 30, 31, 29)];
  assert.equal(scalperPairedBody80Signals([{ identity: identity("NIFTY 50"), bars: nifty }, { identity: identity("XCE", "NFO"), bars: arbitraryPrecursors }], 5).length, 1);
  const gapNifty = [nifty[0], nifty[1], { ...nifty[2], end: "2026-09-08T09:36:00+05:30" }, nifty[3]];
  assert.equal(scalperPairedBody80Signals([{ identity: identity("NIFTY 50"), bars: gapNifty }, { identity: identity("XCE", "NFO"), bars: weakCe }], 5).length, 0);
});
