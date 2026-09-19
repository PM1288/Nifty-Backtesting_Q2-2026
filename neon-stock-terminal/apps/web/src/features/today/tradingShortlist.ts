import type { OiisLiveCandidates } from '../../lib/api';
import type { ProgressionMatrixRow } from './scalperProgressionMatrix';

export type TradeSide = 'LONG' | 'SHORT';
export type PersonalPick = { symbol: string; side: TradeSide };
export type TradingPick = PersonalPick & { sources: string[] };
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
export function buildTradingShortlist(today: string, progressionDate: string | undefined, ranks: ProgressionMatrixRow[], oiis: OiisLiveCandidates | undefined, personal: PersonalPick[]): TradingPick[] {
  const picks = new Map<string, TradingPick>();
  const add = (symbol: string, side: TradeSide, source: string) => {
    const key = `${symbol}:${side}`;
    const row = picks.get(key) ?? {symbol, side, sources: []};
    if (!row.sources.includes(source)) row.sources.push(source);
    picks.set(key, row);
  };
  if (progressionDate === today) for (const row of ranks) {
    if (row.allGreen) add(row.stock.symbol, 'LONG', 'MWHD-BULL · all gates');
    if (row.bearAllRed) add(row.stock.symbol, 'SHORT', 'MWHD-BEAR · all gates');
  }
  if (oiis?.tradeDate === today && oiis.runId) for (const row of oiis.candidates) {
    if (row.selected !== true || String(row.trade_date).slice(0, 10) !== today) continue;
    if (row.direction === 'LONG' || row.direction === 'SHORT') add(String(row.symbol), row.direction, 'OIIS · selected');
  }
  for (const row of personal) add(row.symbol, row.side, 'Personal');
  const rankMap = new Map(ranks.map(row => [row.stock.symbol, row]));
  return [...picks.values()].sort((a,b) => {
    const rank = (pick: TradingPick) => (pick.side === 'LONG' ? rankMap.get(pick.symbol)?.rank : rankMap.get(pick.symbol)?.bearRank) ?? Infinity;
    return rank(a) - rank(b) || a.symbol.localeCompare(b.symbol);
  });
}
