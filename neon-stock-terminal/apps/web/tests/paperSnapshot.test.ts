import test from 'node:test';
import assert from 'node:assert/strict';
import { retainCompletePaperSnapshot } from '../src/lib/paperSnapshot';

test('D09: a bootstrap must not replace census above an older complete ledger', () => {
  const complete = { summary: { count: 1 }, stockTrades: [{ id: 1 }], asOf: 'old' };
  const bootstrap = { summary: { count: 2 }, stockTrades: [], asOf: 'new', detailState: 'LOADING' };
  assert.equal(retainCompletePaperSnapshot(complete, bootstrap), complete);
  assert.equal(retainCompletePaperSnapshot(null, bootstrap), bootstrap);
  assert.equal(retainCompletePaperSnapshot({ ...complete, stockTrades: [] }, bootstrap).asOf, 'old');
  assert.equal(retainCompletePaperSnapshot({ ...bootstrap, asOf: 'older' }, bootstrap), bootstrap);
});
