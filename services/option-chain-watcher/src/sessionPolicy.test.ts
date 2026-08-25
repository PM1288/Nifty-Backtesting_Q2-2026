import assert from 'node:assert/strict';
import test from 'node:test';
import { marketSnapshotFingerprint, sessionSuppressionReason, ExchangeSession } from './sessionPolicy';
import { SelectedSnapshot } from './transform';

const session: ExchangeSession = {
  tradeDate: '2026-08-14',
  isTradingDay: true,
  marketOpenAt: new Date('2026-08-14T03:45:00.000Z'),
  marketCloseAt: new Date('2026-08-14T10:00:00.000Z'),
  specialSession: false,
  sessionLabel: 'REGULAR',
};

test('exchange calendar gates before, during and after the configured session', () => {
  assert.equal(sessionSuppressionReason(session, new Date('2026-08-14T03:44:59.000Z')), 'BEFORE_MARKET_OPEN');
  assert.equal(sessionSuppressionReason(session, new Date('2026-08-14T03:45:00.000Z')), null);
  assert.equal(sessionSuppressionReason(session, new Date('2026-08-14T10:00:00.000Z')), null);
  assert.equal(sessionSuppressionReason(session, new Date('2026-08-14T10:00:01.000Z')), 'AFTER_MARKET_CLOSE');
});

test('holidays and missing special-session times fail closed', () => {
  assert.equal(sessionSuppressionReason({ ...session, isTradingDay: false }, new Date('2026-08-14T05:00:00.000Z')), 'NOT_TRADING_DAY');
  assert.equal(sessionSuppressionReason({ ...session, specialSession: true, marketOpenAt: null }, new Date('2026-08-14T05:00:00.000Z')), 'SESSION_TIME_UNAVAILABLE');
  assert.equal(sessionSuppressionReason(null, new Date('2026-08-14T05:00:00.000Z')), 'TRADING_CALENDAR_MISSING');
});

function snapshot(): SelectedSnapshot {
  return {
    symbol: 'NIFTY', expiryDate: '2026-08-18', underlyingValue: 24400, atmStrike: 24400,
    strikesAround: 6, capturedAt: new Date('2026-08-14T04:00:00.000Z'), raw: { ignored: true },
    legs: [{ strike: 24400, optionType: 'CE', lastPrice: 100, change: 2, iv: 10, volume: 500,
      oi: 1000, chgOi: 50, bidQty: 10, bidPrice: 99, askQty: 12, askPrice: 101,
      delta: 0.5, gamma: 0.01, theta: -5, vega: 8, instrumentIdentifier: 'NIFTY-CE' }],
  };
}

test('dedupe fingerprint ignores capture time, raw response and locally decaying greeks', () => {
  const first = snapshot();
  const second = snapshot();
  second.capturedAt = new Date('2026-08-14T04:02:00.000Z');
  second.raw = { different: true };
  second.legs[0].theta = -5.1;
  assert.equal(marketSnapshotFingerprint(first), marketSnapshotFingerprint(second));
});

test('dedupe fingerprint changes when exchange OI or executable quotes change', () => {
  const first = snapshot();
  const oiChanged = snapshot();
  oiChanged.legs[0].oi = 1001;
  const askChanged = snapshot();
  askChanged.legs[0].askPrice = 102;
  assert.notEqual(marketSnapshotFingerprint(first), marketSnapshotFingerprint(oiChanged));
  assert.notEqual(marketSnapshotFingerprint(first), marketSnapshotFingerprint(askChanged));
});
