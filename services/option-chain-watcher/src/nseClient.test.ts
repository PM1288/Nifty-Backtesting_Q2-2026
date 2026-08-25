import assert from 'node:assert/strict';
import test from 'node:test';
import { pickExpiryRoles } from './nseClient';

test('picks nearest weekly and last expiry of the front available month', () => {
  const roles = pickExpiryRoles(['18-Aug-2026', '25-Aug-2026', '01-Sep-2026', '29-Sep-2026']);
  assert.equal(roles.W0, '18-Aug-2026');
  assert.equal(roles.M0, '25-Aug-2026');
  assert.equal(roles.alsoNearestWeekly, false);
});

test('deduplicates weekly and monthly when only the monthly expiry remains', () => {
  const roles = pickExpiryRoles(['25-Aug-2026', '01-Sep-2026', '29-Sep-2026']);
  assert.equal(roles.W0, '25-Aug-2026');
  assert.equal(roles.M0, '25-Aug-2026');
  assert.equal(roles.alsoNearestWeekly, true);
});
