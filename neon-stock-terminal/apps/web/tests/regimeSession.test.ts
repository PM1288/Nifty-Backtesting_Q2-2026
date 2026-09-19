import test from 'node:test';
import assert from 'node:assert/strict';
import { regimeHistoryThrough } from '../src/lib/regimeSession';

test('D02: later history never leaks into selected section or stability calculation', () => {
  const rows = [{ tradeDate: '2026-09-18', regime: 'risk-on' }, { tradeDate: '2026-09-16', regime: 'risk-off' }];
  assert.deepEqual(regimeHistoryThrough(rows, '2026-09-16'), [rows[1]]);
  assert.deepEqual(regimeHistoryThrough(rows, '2026-09-18'), [rows[1], rows[0]]);
  assert.deepEqual(regimeHistoryThrough(rows, ''), []);
  assert.equal(rows[0].tradeDate, '2026-09-18');
});
