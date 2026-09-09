import test from "node:test";
import assert from "node:assert/strict";
import { SCALPER_ENTRY_RULE, scalperPairedBody70Signals } from "../src/lib/scalperSignals";

const bar = (end: string, open: number, close: number, ema9: number) => ({ end, open, close, ema9, low: Math.min(open, close) - 1, high: Math.max(open, close) + 1, closed: true });
const identity = (tradingsymbol: string, exchange = "NSE", symbol_token = tradingsymbol) => ({ tradingsymbol, exchange, symbol_token });
const t = ["09:25", "09:30", "09:35", "09:40"].map((time) => `2026-09-08T${time}:00+05:30`);

test("paired body70 CALL requires both precursor bodies below EMA while colour remains optional", () => {
  const panes = [
    { identity: identity("NIFTY 50"), bars: [bar(t[0], 100, 98, 101), bar(t[1], 97, 99, 100), bar(t[2], 99, 109, 102), bar(t[3], 104, 106, 103)] },
    { identity: identity("NIFTY08SEP23600CE", "NFO", "ce"), bars: [bar(t[0], 22, 20, 23), bar(t[1], 19, 21, 22), bar(t[2], 22, 32, 25), bar(t[3], 30, 31, 29)] },
    { identity: identity("NIFTY08SEP23600PE", "NFO", "pe"), bars: [] },
  ];
  const events = scalperPairedBody70Signals(panes, 5);
  assert.equal(events.length, 1);
  assert.equal(events[0].direction, "CALL");
  assert.equal(events[0].underlyingBodyFraction, 0.7);
  assert.equal(events[0].optionBodyFraction, 0.7);
  assert.equal(events[0].optionPremium, 30);
  assert.equal(events[0].state, "RETROSPECTIVE_ENTRY_REFERENCE");
  assert.match(events[0].id, new RegExp(`^${SCALPER_ENTRY_RULE}`));
});

test("paired body70 PUT needs two complete bodies above EMA and bullish PE reversal", () => {
  const panes = [
    { identity: identity("NIFTY 50"), bars: [bar(t[0], 100, 102, 99), bar(t[1], 103, 101, 100), bar(t[2], 109, 99, 106), bar(t[3], 100, 98, 101)] },
    { identity: identity("NIFTY08SEP23600CE", "NFO", "ce"), bars: [] },
    { identity: identity("NIFTY08SEP23600PE", "NFO", "pe"), bars: [bar(t[0], 24, 22, 25), bar(t[1], 21, 23, 24), bar(t[2], 22, 32, 25), bar(t[3], 31, 33, 30)] },
  ];
  const events = scalperPairedBody70Signals(panes, 5);
  assert.equal(events.length, 1);
  assert.equal(events[0].direction, "PUT");
  assert.equal(events[0].underlyingBodyFraction, 0.7);
  assert.equal(events[0].optionBodyFraction, 0.7);
  assert.equal(events[0].state, "RETROSPECTIVE_ENTRY_REFERENCE");
});

test("rejects missing option, invalid precursor position, non-consecutive bars and 69.99 percent", () => {
  const nifty = [bar(t[0], 100, 98, 101), bar(t[1], 99, 97, 100), bar(t[2], 99, 109, 102), bar(t[3], 104, 106, 103)];
  assert.equal(scalperPairedBody70Signals([{ identity: identity("NIFTY 50"), bars: nifty }], 5).length, 0);
  const weakCe = [bar(t[0], 24, 22, 25), bar(t[1], 23, 21, 24), bar(t[2], 22, 32, 25.001), bar(t[3], 30, 31, 29)];
  assert.equal(scalperPairedBody70Signals([{ identity: identity("NIFTY 50"), bars: nifty }, { identity: identity("XCE", "NFO"), bars: weakCe }], 5).length, 0);
  const invalidPrecursors = [bar(t[0], 22, 24, 21), bar(t[1], 23, 21, 24), bar(t[2], 22, 32, 25), bar(t[3], 30, 31, 29)];
  assert.equal(scalperPairedBody70Signals([{ identity: identity("NIFTY 50"), bars: nifty }, { identity: identity("XCE", "NFO"), bars: invalidPrecursors }], 5).length, 0);
  const gapNifty = [nifty[0], nifty[1], { ...nifty[2], end: "2026-09-08T09:36:00+05:30" }, nifty[3]];
  assert.equal(scalperPairedBody70Signals([{ identity: identity("NIFTY 50"), bars: gapNifty }, { identity: identity("XCE", "NFO"), bars: weakCe }], 5).length, 0);
});
