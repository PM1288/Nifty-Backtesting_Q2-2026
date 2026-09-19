import type { OiisLiveCandidates } from '../../lib/api';
import type { ThreeMonthStrategyResponse } from '../../lib/types';
import type { ProgressionMatrixRow } from './scalperProgressionMatrix';

export type TradeSide = 'LONG' | 'SHORT';
export type PersonalPick = { symbol: string; side: TradeSide };
export type TradingSourceId = 'MANUAL' | 'MWHD' | 'OIIS' | 'THREE_MONTH';
export type TradingPick = PersonalPick & { sources: string[]; sourceIds: TradingSourceId[]; agreementCount: number };
export const tradingSourceLabels: Record<TradingSourceId, string> = {
  MANUAL: 'Manual', MWHD: 'MWD / MWHD', OIIS: 'OIIS', THREE_MONTH: '3Month',
};
export const shortlistKey = (uid: string) => `n50.home-trading-shortlist.v1:${encodeURIComponent(uid)}`;
export function parsePersonalPicks(raw: string | null): PersonalPick[] {
  try {
    const rows: unknown = JSON.parse(raw ?? '[]');
    if (!Array.isArray(rows)) return [];
    const seen = new Set<string>();
    return rows.filter((r): r is PersonalPick => {
      if (!r || typeof r.symbol !== 'string' || !/^[A-Z0-9&._-]{1,40}$/.test(r.symbol) || !['LONG', 'SHORT'].includes(r.side)) return false;
      const key = `${r.symbol}:${r.side}`;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    }).slice(0, 100).map(({symbol, side}) => ({symbol, side}));
  } catch { return []; }
}
export function buildTradingShortlist(today: string, progressionDate: string | undefined, ranks: ProgressionMatrixRow[], oiis: OiisLiveCandidates | undefined, personal: PersonalPick[], threeMonth?: ThreeMonthStrategyResponse): TradingPick[] {
  const picks = new Map<string, TradingPick>();
  const add = (symbol: string, side: TradeSide, sourceId: TradingSourceId, source: string) => {
    const key = `${symbol}:${side}`;
    const row = picks.get(key) ?? {symbol, side, sources: [], sourceIds: [], agreementCount: 0};
    if (!row.sources.includes(source)) row.sources.push(source);
    if (!row.sourceIds.includes(sourceId)) row.sourceIds.push(sourceId);
    row.agreementCount = row.sourceIds.length;
    picks.set(key, row);
  };
  if (progressionDate === today) for (const row of ranks) {
    // The API envelope is generated today but its last retained intraday bars
    // can belong to an earlier session (weekends/outages). Never relabel them.
    const timestamps = [row.source?.currentHourStartedAt, row.source?.current15mStartedAt, row.source?.current5mStartedAt];
    const sameSession = timestamps.every(value => value && Number.isFinite(Date.parse(value)) && new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value)) === today);
    if (!sameSession) continue;
    if (row.allGreen) add(row.stock.symbol, 'LONG', 'MWHD', 'MWHD-BULL · all gates');
    if (row.bearAllRed) add(row.stock.symbol, 'SHORT', 'MWHD', 'MWHD-BEAR · all gates');
  }
  if (oiis?.tradeDate === today && oiis.runId) for (const row of oiis.candidates) {
    if (row.selected !== true || String(row.trade_date).slice(0, 10) !== today) continue;
    if (row.direction === 'LONG' || row.direction === 'SHORT') add(String(row.symbol), row.direction, 'OIIS', 'OIIS · selected');
  }
  if (threeMonth?.sessionDate === today) for (const row of threeMonth.rows) {
    if (row.sessionDate === today && row.qualification === 'QUALIFIED') add(row.symbol, 'LONG', 'THREE_MONTH', '3Month · qualified');
  }
  for (const row of personal) add(row.symbol, row.side, 'MANUAL', 'Manual');
  const rankMap = new Map(ranks.map(row => [row.stock.symbol, row]));
  return [...picks.values()].sort((a,b) => {
    const rank = (pick: TradingPick) => (pick.side === 'LONG' ? rankMap.get(pick.symbol)?.rank : rankMap.get(pick.symbol)?.bearRank) ?? Infinity;
    return b.agreementCount - a.agreementCount || rank(a) - rank(b) || a.symbol.localeCompare(b.symbol);
  });
}
