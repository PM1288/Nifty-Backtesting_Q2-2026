import test from 'node:test';
import assert from 'node:assert/strict';
import { scalperFreshness } from '../src/lib/scalperV2Freshness';
const sessions = [{ trade_date: '2026-09-18', market_open_ts: '2026-09-18T03:45:00Z', market_close_ts: '2026-09-18T10:00:00Z' }];
test('Scalper freshness uses the last exchange session on weekends', () => {
  assert.equal(scalperFreshness(sessions, [{name:'CE',end:'2026-09-18T10:00:00Z'}],5,Date.parse('2026-09-19T06:00:00Z')).state,'current');
});
test('Scalper flags previous-day, missing and delayed exact-contract candles', () => {
  for (const end of [null,'2026-09-17T10:00:00Z','2026-09-18T04:00:00Z']) {
    assert.equal(scalperFreshness(sessions,[{name:'PE',end}],5,Date.parse('2026-09-18T06:00:00Z')).state,'stale');
  }
});
test('Scalper permits incomplete first candles and reports missing calendars', () => {
  assert.equal(scalperFreshness(sessions,[{name:'CE',end:null}],60,Date.parse('2026-09-18T04:00:00Z')).state,'waiting');
  assert.equal(scalperFreshness([],[],5,Date.now()).state,'unknown');
});
