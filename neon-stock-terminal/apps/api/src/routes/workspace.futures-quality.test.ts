import assert from 'node:assert/strict';
import test from 'node:test';
import { futuresWorkspacePayload } from './workspace';

test('D01: invalid and missing futures OI never imply short covering', () => {
  for (const value of ['-4607714335521942500', '-4615959397747128000', '-100.01', 'NaN', null, '']) {
    const row = futuresWorkspacePayload([{ oi_change_pct: value, price_change_pct: '2', buildup: 'SHORT_COVERING' }], []).contracts[0];
    assert.equal(row.oi_change_pct, null);
    assert.equal(row.buildup, 'UNAVAILABLE');
    assert.ok(row.oi_change_reason);
  }
});

test('D01: valid zero, complete close and large positive changes remain distinct', () => {
  for (const [pct, state] of [[0, 'NEUTRAL'], [-100, 'SHORT_COVERING'], [9999900, 'LONG_BUILDUP']] as const) {
    const row = futuresWorkspacePayload([{ oi_change_pct: String(pct), price_change_pct: '2' }], []).contracts[0];
    assert.equal(Number(row.oi_change_pct), pct);
    assert.equal(row.buildup, state);
  }
  assert.equal(futuresWorkspacePayload([{ oi_change_pct: '20', price_change_pct: null }], []).contracts[0].buildup, 'UNAVAILABLE');
});
