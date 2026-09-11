import assert from "node:assert/strict";
import test from "node:test";
import { buildMwdEmaValueModel } from "../src/lib/mwdEmaValue";
import type { IntradayBar } from "../src/lib/types";

const bar = (t: string, o: number, c = o + 1, v = 100_000): IntradayBar => ({ t, o, h: Math.max(o, c) + 1, l: Math.min(o, c) - 1, c, v });

test("MWD EMA Value resolves every supplied current and previous period level", () => {
  const daily = [
    bar("2026-01-02T03:45:00.000Z", 60),
    bar("2026-07-01T03:45:00.000Z", 80),
    bar("2026-08-03T03:45:00.000Z", 100),
    bar("2026-08-31T03:45:00.000Z", 110),
    bar("2026-09-01T03:45:00.000Z", 115),
    bar("2026-09-07T03:45:00.000Z", 120),
    bar("2026-09-10T03:45:00.000Z", 130, 135),
  ];
  const intraday = [
    bar("2026-09-11T03:45:00.000Z", 150), // 09:15 IST
    bar("2026-09-11T04:00:00.000Z", 152), // 09:30 IST
    bar("2026-09-11T04:45:00.000Z", 154), // 10:15 IST, next session-aligned hour
    bar("2026-09-11T05:00:00.000Z", 155), // 10:30 IST, latest 15m bucket
    bar("2026-09-11T05:01:00.000Z", 156, 160),
  ];
  const model = buildMwdEmaValueModel(intraday, daily, [bar("2026-09-10T10:00:00.000Z", 20, 20)]);
  const levels = Object.fromEntries(model.levels.map((level) => [level.id, level]));

  assert.equal(model.sessionDate, "2026-09-11");
  assert.equal(levels["15m"].value, 155);
  assert.equal(levels["1h"].value, 154);
  assert.equal(levels.day.value, 150);
  assert.equal(levels.week.value, 120);
  assert.equal(levels.month.value, 115);
  assert.equal(levels.quarter.value, 80);
  assert.equal(levels.year.value, 60);
  assert.equal(levels.pdc.value, 135);
  assert.equal(levels["previous-day"].value, 130);
  assert.equal(levels["previous-week"].value, 110);
  assert.equal(levels["previous-month"].value, 100);
  assert.equal(levels.month.bias, "UP");
  assert.equal(levels["15m"].startIndex, 3);
  assert.equal(levels["1h"].startIndex, 2);
});

test("MWD EMA Value warms EMAs before display and keeps turnover exact", () => {
  const display = [bar("2026-09-11T03:45:00.000Z", 100, 102, 200_000)];
  const warmup = [bar("2026-09-10T09:59:00.000Z", 80, 80), bar("2026-09-10T10:00:00.000Z", 90, 90)];
  const model = buildMwdEmaValueModel(display, [bar("2026-09-10T03:45:00.000Z", 90, 95)], warmup);

  assert.equal(model.bars.length, 1);
  assert.equal(model.ema9.length, 1);
  assert.notEqual(model.ema9[0], display[0]!.c, "pre-session bars must seed the visible EMA");
  const expectedVwap = (display[0]!.h + display[0]!.l + display[0]!.c) / 3;
  assert.equal(model.tradedValueCr[0], expectedVwap * 200_000 / 10_000_000);
});

test("MWD EMA Value never converts missing historical levels to zero", () => {
  const model = buildMwdEmaValueModel([bar("2026-09-11T03:45:00.000Z", 100, 100)], [], []);
  const previous = model.levels.filter((level) => level.id.startsWith("previous") || level.id === "pdc");
  assert.ok(previous.every((level) => level.value == null && level.bias === "UNAVAILABLE"));
});

test("MWD EMA Value excludes same-date observations outside the NSE session", () => {
  const model = buildMwdEmaValueModel([
    bar("2026-09-10T22:35:00.000Z", 50, 51), // 04:05 IST on the selected date
    bar("2026-09-11T03:45:00.000Z", 100, 101), // 09:15 IST
    bar("2026-09-11T09:59:00.000Z", 110, 111), // 15:29 IST
    bar("2026-09-11T10:00:00.000Z", 200, 201), // 15:30 IST
  ], [bar("2026-09-10T03:45:00.000Z", 90, 95)]);

  assert.deepEqual(model.bars.map((row) => row.o), [100, 110]);
  assert.equal(model.levels.find((level) => level.id === "day")?.value, 100);
  assert.equal(model.latestPrice, 111);
});
