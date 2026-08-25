import { SelectedSnapshot } from './transform';

export type ExchangeSession = {
  tradeDate: string;
  isTradingDay: boolean;
  marketOpenAt: Date | null;
  marketCloseAt: Date | null;
  specialSession: boolean;
  sessionLabel: string | null;
};

export function sessionSuppressionReason(session: ExchangeSession | null, at: Date): string | null {
  if (!session) return 'TRADING_CALENDAR_MISSING';
  if (!session.isTradingDay) return 'NOT_TRADING_DAY';
  if (!session.marketOpenAt || !session.marketCloseAt) return 'SESSION_TIME_UNAVAILABLE';
  const now = at.getTime();
  if (now < session.marketOpenAt.getTime()) return 'BEFORE_MARKET_OPEN';
  if (now > session.marketCloseAt.getTime()) return 'AFTER_MARKET_CLOSE';
  return null;
}

type FingerprintSnapshot = Pick<SelectedSnapshot, 'symbol' | 'expiryDate' | 'underlyingValue' | 'atmStrike' | 'strikesAround'> & {
  legs: Array<Pick<SelectedSnapshot['legs'][number],
    'strike' | 'optionType' | 'lastPrice' | 'change' | 'iv' | 'volume' | 'oi' | 'chgOi' |
    'bidQty' | 'bidPrice' | 'askQty' | 'askPrice' | 'instrumentIdentifier'>>;
};

function stableNumber(value: number | null): number | null {
  return value == null || !Number.isFinite(value) ? null : value;
}

export function marketSnapshotFingerprint(snapshot: FingerprintSnapshot): string {
  const legs = [...snapshot.legs]
    .sort((left, right) => left.strike - right.strike || left.optionType.localeCompare(right.optionType))
    .map(leg => [
      stableNumber(leg.strike), leg.optionType, stableNumber(leg.lastPrice), stableNumber(leg.change),
      stableNumber(leg.iv), stableNumber(leg.volume), stableNumber(leg.oi), stableNumber(leg.chgOi),
      stableNumber(leg.bidQty), stableNumber(leg.bidPrice), stableNumber(leg.askQty), stableNumber(leg.askPrice),
      leg.instrumentIdentifier ?? null,
    ]);
  return JSON.stringify([
    snapshot.symbol,
    snapshot.expiryDate,
    stableNumber(snapshot.underlyingValue),
    stableNumber(snapshot.atmStrike),
    snapshot.strikesAround,
    legs,
  ]);
}
