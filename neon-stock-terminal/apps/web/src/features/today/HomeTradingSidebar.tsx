import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuthGate } from '../../auth/AuthGateProvider';
import { fetchOiisLiveCandidates } from '../../lib/api';
import type { Quote, ScalperProgressionResponse } from '../../lib/types';
import { buildProgressionMatrixRows } from './scalperProgressionMatrix';
import { buildTradingShortlist, parsePersonalPicks, shortlistKey, type PersonalPick, type TradeSide } from './tradingShortlist';
import styles from './HomeTradingSidebar.module.css';

const istDay = () => new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const number = (value: number | null | undefined, suffix = '') => value != null && Number.isFinite(value) ? `${value.toLocaleString('en-IN', {maximumFractionDigits:2})}${suffix}` : '—';
type Props = { stocks: Quote[]; progression?: ScalperProgressionResponse; progressionError: boolean };
export function HomeTradingSidebar(props: Props) {
  const {user} = useAuthGate();
  return user ? <UserSidebar key={user.uid} uid={user.uid} {...props} /> : null;
}
function UserSidebar({uid, stocks, progression, progressionError}: Props & {uid: string}) {
  const [open, setOpen] = useState(false);
  const [today, setToday] = useState(istDay);
  const [personal, setPersonal] = useState<PersonalPick[]>(() => { try {return parsePersonalPicks(localStorage.getItem(shortlistKey(uid)));} catch {return [];} });
  const [symbol, setSymbol] = useState('');
  const [side, setSide] = useState<TradeSide>('LONG');
  const [message, setMessage] = useState('');
  const panel = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const close = () => { setOpen(false); trigger.current?.focus(); };
  const resetTimer = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const active = document.activeElement;
      if (active && panel.current?.contains(active) && (active.matches('input,select,textarea') || active.matches(':focus-visible'))) { resetTimer(); return; }
      setOpen(false);
      if (active && panel.current?.contains(active)) trigger.current?.focus();
    }, 10_000);
  };
  useEffect(() => { if (open) resetTimer(); return () => clearTimeout(timer.current); }, [open]);
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {if (event.key === 'Escape') close();};
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [open]);
  useEffect(() => { const id = setInterval(() => setToday(istDay()), 30_000); return () => clearInterval(id); }, []);
  useEffect(() => {
    const sync = (event: StorageEvent) => { if (event.key === shortlistKey(uid)) setPersonal(parsePersonalPicks(event.newValue)); };
    window.addEventListener('storage', sync); return () => window.removeEventListener('storage', sync);
  }, [uid]);
  const oiis = useQuery({queryKey:['home-trading-selections', uid, today], queryFn:async ({signal}) => {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, {once:true});
    if (signal.aborted) abort();
    const timeout = setTimeout(abort, 30_000);
    try { return await fetchOiisLiveCandidates(today, undefined, controller.signal); }
    finally { clearTimeout(timeout); signal.removeEventListener('abort', abort); }
  }, enabled:open, staleTime:30_000, refetchInterval:open ? 60_000 : false, retry:false});
  const universe = useMemo(() => {
    const map = new Map(stocks.map(stock => [stock.symbol, stock]));
    for (const row of progression?.rows ?? []) if (!map.has(row.symbol)) map.set(row.symbol, {symbol:row.symbol, name:row.companyName ?? row.symbol, last:row.currentValue, dayOpen:row.todayOpen, timestamp:row.observedAt} as Quote);
    return map;
  }, [stocks, progression]);
  // Same cohort/order as the existing Home MWHD matrix; personal additions do
  // not silently re-rank the strategy universe.
  const ranks = useMemo(() => buildProgressionMatrixRows(stocks, progression?.rows ?? []), [stocks, progression]);
  const rankMap = useMemo(() => new Map(ranks.filter(row => progression?.rows.some(source => source.symbol === row.stock.symbol)).map(row => [row.stock.symbol,row])), [ranks, progression]);
  const rows = useMemo(() => buildTradingShortlist(today, progression?.sessionDate, ranks, oiis.data, personal), [today, progression?.sessionDate, ranks, oiis.data, personal]);
  const save = (next: PersonalPick[]) => {
    try { localStorage.setItem(shortlistKey(uid), JSON.stringify(next)); setPersonal(next); setMessage('Personal list saved on this browser for your account.'); }
    catch {setMessage('Unable to save: browser storage is unavailable.');}
  };
  return <>
    <button ref={trigger} className={styles.tag} aria-expanded={open} aria-controls="home-trading-sidebar" onClick={() => setOpen(!open)} data-testid="home-trading-toggle">‹ Trading list</button>
    {open && <aside ref={panel} id="home-trading-sidebar" className={styles.panel} aria-label="Today's trading shortlist" onPointerMove={resetTimer} onPointerDown={resetTimer} onScrollCapture={resetTimer} onKeyDown={event => {if (event.key === 'Escape') close(); else resetTimer();}} data-testid="home-trading-sidebar">
      <header className={styles.header}><h2>Trading shortlist</h2><button onClick={close} aria-label="Close trading shortlist">✕</button></header>
      <div className={styles.body}>
        <p>{today} · Long / Short</p>
        <p className={styles.muted}>OIIS selections and fully confirmed MWHD routes. Selections are not executed trades. Other strategies remain in their own dashboards.</p>
        <p className={styles.muted}>Closes after 10 idle seconds; stays open for keyboard use or editing.</p>
        {oiis.isLoading && <p role="status">Loading OIIS selections…</p>}
        {oiis.isError && <p role="alert">OIIS unavailable{oiis.data ? ' · last loaded selections shown' : ''}. <button onClick={() => oiis.refetch()}>Retry</button></p>}
        {!oiis.isLoading && !oiis.isError && !oiis.data?.runId && <p>No completed OIIS selection run today.</p>}
        <p className={styles.muted}>MWHD: {progressionError ? 'refresh unavailable' : progression ? `session ${progression.sessionDate}` : 'loading'}. {progression?.sessionDate !== today && 'Older ranks are context only, not today’s selections.'}</p>
        {(['LONG','SHORT'] as const).map(direction => <section key={direction} aria-label={`${direction} stocks`}>
          <h3>{direction} · {rows.filter(row => row.side === direction).length}</h3>
          {!rows.some(row => row.side === direction) && <p>No selected or personal stocks in this direction.</p>}
          {rows.filter(row => row.side === direction).map(row => {
            const quote = universe.get(row.symbol); const rank = rankMap.get(row.symbol);
            const quoteDay = quote?.timestamp && Number.isFinite(Date.parse(quote.timestamp)) ? new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(quote.timestamp)) : null;
            return <article className={styles.row} key={`${row.symbol}:${row.side}`}>
              <div className={styles.identity}><Link to={`/analytics/stock/${encodeURIComponent(row.symbol)}`}>{row.symbol}</Link><b>₹{number(quote?.last)}</b></div>
              <div>{row.sources.join(' · ')}</div>
              <div className={styles.stats}><span>BULL #{rank?.rank ?? '—'}</span><span>BEAR #{rank?.bearRank ?? '—'}</span><span>{direction === 'LONG' ? rank?.best.pass ?? '—' : rank?.bearBest.pass ?? '—'} gates passed</span></div>
              <div className={(quote?.changePct ?? 0) > 0 ? styles.positive : (quote?.changePct ?? 0) < 0 ? styles.negative : undefined}>{quoteDay === today ? 'Today' : 'Snapshot'} change: {number(quote?.changePct,'%')}</div>
              <div className={styles.muted}>Quote: {quoteDay ?? 'time unavailable'} · Rank session: {progression?.sessionDate ?? 'unavailable'}</div>
              {row.sources.includes('Personal') && <button onClick={() => save(personal.filter(pick => !(pick.symbol === row.symbol && pick.side === row.side)))}>Remove personal {direction.toLowerCase()}</button>}
            </article>;
          })}
        </section>)}
        <form className={styles.form} onSubmit={event => {
          event.preventDefault(); const value = symbol.trim().toUpperCase();
          if (!universe.has(value)) {setMessage('Choose an exact symbol from the tracked stock list.'); return;}
          if (personal.some(pick => pick.symbol === value && pick.side === side)) {setMessage('Already in your personal list.'); return;}
          if (personal.length >= 100) {setMessage('Personal list limit is 100 entries.'); return;}
          save([...personal, {symbol:value,side}]); setSymbol('');
        }}>
          <strong>Add personal stock</strong><label>Stock symbol<input list="home-trading-symbols" value={symbol} onChange={event => setSymbol(event.target.value)} maxLength={40} required /></label>
          <datalist id="home-trading-symbols">{[...universe.keys()].sort().map(value => <option key={value} value={value} />)}</datalist>
          <label>Direction<select value={side} onChange={event => setSide(event.target.value as TradeSide)}><option value="LONG">Long</option><option value="SHORT">Short</option></select></label>
          <button type="submit">Add to my list</button><p className={styles.muted}>Personal additions are saved per account on this browser, not synced between devices. Adding a stock never places an order.</p>
          <p role="status">{message}</p>
        </form>
        <Link to="/strategy/oiis-live">OIIS evidence</Link> · <Link to="/strategy/scalper-dashboard">Monthly screener</Link>
      </div>
    </aside>}
  </>;
}
