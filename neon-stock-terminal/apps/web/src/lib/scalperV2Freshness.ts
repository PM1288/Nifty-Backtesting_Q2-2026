export type ScalperSession = { trade_date: string; market_open_ts: string; market_close_ts: string };
export function scalperFreshness(sessions: ScalperSession[], observations: { name: string; end: string | null }[], interval: number, now: number) {
  const eligible = sessions.filter(s => Date.parse(s.market_open_ts) <= now).sort((a,b) => Date.parse(b.market_open_ts) - Date.parse(a.market_open_ts));
  const session = eligible[0];
  if (!session) return { state: 'unknown', message: 'Session calendar unavailable; data freshness cannot be verified.' };
  const open = Date.parse(session.market_open_ts), close = Date.parse(session.market_close_ts);
  const cutoff = Math.min(now, close);
  const allowance = (interval + 2) * 60_000;
  if (cutoff - open < allowance) return { state: 'waiting', message: `${session.trade_date} · waiting for the first completed ${interval}m candle` };
  const missing = observations.filter(o => {
    const end = Date.parse(o.end ?? '');
    return !Number.isFinite(end) || end <= open || end > now || cutoff - end > allowance;
  });
  return missing.length
    ? { state: 'stale', message: `${missing.map(o => o.name).join(', ')}: missing or delayed ${session.trade_date} candles. Latest data is retained; retrying every minute.` }
    : { state: 'current', message: `${session.trade_date} · ${now > close ? 'market closed · latest session' : 'current session'} · updates every minute` };
}
