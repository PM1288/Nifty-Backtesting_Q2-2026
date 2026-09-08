import test from "node:test";
import assert from "node:assert/strict";
import { scalperBody70Signals } from "../src/lib/scalperSignals";

const bar = (end: string, open: number, close: number, ema9: number, low = Math.min(open, close) - 1, high = Math.max(open, close) + 1) => ({ end, open, close, ema9, low, high, closed: true });
const identity = (tradingsymbol: string, exchange = "NSE") => ({ tradingsymbol, exchange });

test("body70 call uses prior close, strict cross and immediately next open", () => {
  const times = ["2026-09-08T09:30:00+05:30", "2026-09-08T09:35:00+05:30", "2026-09-08T09:40:00+05:30"];
  const panes = [
    { identity: identity("NIFTY 50"), bars: [bar(times[0], 96, 98, 100), bar(times[1], 99, 109, 101), bar(times[2], 104, 106, 103)] },
    { identity: identity("NIFTY08SEP23600CE", "NFO"), bars: [bar(times[2], 20, 23, 21)] },
  ];
  const events = scalperBody70Signals(panes, 5);
  assert.equal(events.length, 1);
  assert.equal(events[0].direction, "CALL");
  assert.equal(events[0].bodyFraction, 0.8);
  assert.equal(events[0].underlyingOpen, 104);
  assert.equal(events[0].optionPremium, 20);
  assert.equal(events[0].state, "RETROSPECTIVE_ENTRY_REFERENCE");
});

test("body70 put is symmetric, equality fails and missing immediate bar is not skipped", () => {
  const panes = [{ identity: identity("NIFTY 50"), bars: [
    bar("2026-09-08T04:00:00.000Z", 108, 107, 100, 106),
    bar("2026-09-08T04:05:00.000Z", 109, 99, 107),
    bar("2026-09-08T04:15:00.000Z", 98, 97, 100),
  ] }];
  const events = scalperBody70Signals(panes, 5);
  assert.equal(events.length, 1);
  assert.equal(events[0].direction, "PUT");
  assert.equal(events[0].state, "NEXT_BAR_MISSING");
  assert.equal(events[0].underlyingOpen, null);

  const equality = [{ identity: identity("NIFTY 50"), bars: [
    bar("2026-09-08T04:00:00.000Z", 96, 98, 100),
    bar("2026-09-08T04:05:00.000Z", 99, 109, 101),
    bar("2026-09-08T04:10:00.000Z", 101, 104, 102),
  ] }];
  assert.equal(scalperBody70Signals(equality, 5)[0].state, "NEXT_OPEN_FAILED");
});

test("69.99 percent and doji bodies do not round into eligibility", () => {
  const t = ["2026-09-08T04:00:00.000Z", "2026-09-08T04:05:00.000Z"];
  const almost = [{ identity: identity("NIFTY 50"), bars: [bar(t[0], 96, 98, 100), bar(t[1], 100, 110, 103.001)] }];
  assert.equal(scalperBody70Signals(almost, 5).length, 0);
  const doji = [{ identity: identity("NIFTY 50"), bars: [bar(t[0], 96, 98, 100), bar(t[1], 100, 100, 100)] }];
  assert.equal(scalperBody70Signals(doji, 5).length, 0);
});
