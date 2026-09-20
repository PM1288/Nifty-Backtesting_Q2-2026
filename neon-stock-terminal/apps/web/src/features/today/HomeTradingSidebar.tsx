import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuthGate } from '../../auth/AuthGateProvider';
import { fetchOiisLiveCandidates } from '../../lib/api';
import { useThreeMonthStrategy } from '../../lib/hooks';
import type { Quote, ScalperProgressionResponse } from '../../lib/types';
import { buildProgressionMatrixRows, directionalProgression, highestProgressionStage, progressionFunnel, sortProgressionRows, type ProgressionFunnelStage } from './scalperProgressionMatrix';
import { buildTradingShortlist, parsePersonalPicks, shortlistKey, tradingSourceLabels, type PersonalPick, type TradeSide, type TradingSourceId } from './tradingShortlist';
import styles from './HomeTradingSidebar.module.css';

const istDay = () => new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const number = (value: number | null | undefined, suffix = '') => value != null && Number.isFinite(value) ? `${value.toLocaleString('en-IN', {maximumFractionDigits:2})}${suffix}` : '—';
const stageLabel: Record<ProgressionFunnelStage, string> = {mwd:'MWD',hour:'MWDH','15m':'MWDH 15','5m':'MWDH 5'};
type Props = {
  stocks: Quote[];
  progression?: ScalperProgressionResponse;
  progressionError: boolean;
  progressionRefreshing?: boolean;
  onProgressionRetry?: () => void;
};
export function HomeTradingSidebar(props: Props) {
  const {user} = useAuthGate();
  return user ? <UserSidebar key={user.uid} uid={user.uid} {...props} /> : null;
}
function UserSidebar({uid, stocks, progression, progressionError, progressionRefreshing, onProgressionRetry}: Props & {uid: string}) {
  const [open, setOpen] = useState(false);
  const [today, setToday] = useState(istDay);
  const [personal, setPersonal] = useState<PersonalPick[]>(() => { try {return parsePersonalPicks(localStorage.getItem(shortlistKey(uid)));} catch {return [];} });
  const [symbol, setSymbol] = useState('');
  const [side, setSide] = useState<TradeSide>('LONG');
  const [message, setMessage] = useState('');
  const panel = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const readyToIdleClose = useRef(false);
  const close = () => { setOpen(false); trigger.current?.focus(); };
  const resetTimer = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (!readyToIdleClose.current) { resetTimer(); return; }
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
  const threeMonth = useThreeMonthStrategy('completed', open);
  useEffect(() => { readyToIdleClose.current = Boolean(progression) && !oiis.isLoading && !threeMonth.isLoading; }, [progression, oiis.isLoading, threeMonth.isLoading]);
  const universe = useMemo(() => {
    const map = new Map(stocks.map(stock => [stock.symbol, stock]));
    for (const row of progression?.rows ?? []) if (!map.has(row.symbol)) map.set(row.symbol, {symbol:row.symbol, name:row.companyName ?? row.symbol, last:row.currentValue, dayOpen:row.todayOpen, timestamp:row.observedAt} as Quote);
    for (const row of threeMonth.data?.rows ?? []) if (!map.has(row.symbol)) {
      const daily = row.gates.find(gate => gate.id === 'D0_CLOSE_GT_OPEN');
      map.set(row.symbol, {symbol:row.symbol, name:row.companyName ?? row.symbol, last:daily?.left ?? null, timestamp:row.observedAt} as Quote);
    }
    return map;
  }, [stocks, progression, threeMonth.data]);
  // Same cohort/order as the existing Home MWHD matrix; personal additions do
  // not silently re-rank the strategy universe.
  const ranks = useMemo(() => buildProgressionMatrixRows(stocks, progression?.rows ?? []), [stocks, progression]);
  const rankMap = useMemo(() => new Map(ranks.map(row => [row.stock.symbol,row])), [ranks]);
  const bullFunnel = useMemo(() => progressionFunnel(ranks, 'bull'), [ranks]);
  const bearFunnel = useMemo(() => progressionFunnel(ranks, 'bear'), [ranks]);
  const stageCandidates = useMemo(() => (['bull','bear'] as const).map(direction => ({
    direction,
    rows: sortProgressionRows(ranks, direction).flatMap(row => {
      const stage = highestProgressionStage(directionalProgression(row, direction));
      return stage ? [{row, stage}] : [];
    }).slice(0, 10),
  })), [ranks]);
  const rows = useMemo(() => buildTradingShortlist(today, progression?.sessionDate, ranks, oiis.data, personal, threeMonth.data), [today, progression?.sessionDate, ranks, oiis.data, personal, threeMonth.data]);
  const uniqueStocks = useMemo(() => new Set(rows.map(row => row.symbol)).size, [rows]);
  const maxAgreement = rows.reduce((maximum, row) => Math.max(maximum, row.agreementCount), 0);
  const consensus = rows.filter(row => row.agreementCount === maxAgreement);
  const sourceRows = useMemo(() => (Object.keys(tradingSourceLabels) as TradingSourceId[]).map(sourceId => ({
    sourceId,
    rows: rows.filter(row => row.sourceIds.includes(sourceId)),
  })), [rows]);
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
        <p className={styles.muted}>Manual, completed MWD/MWHD, selected OIIS and qualified 3Month evidence are combined without changing any strategy. Selections are not executed trades.</p>
        <p className={styles.muted}>Closes after 10 idle seconds; stays open for keyboard use or editing.</p>
        {oiis.isLoading && <p role="status">Loading OIIS selections…</p>}
        {oiis.isError && <p role="alert">OIIS unavailable{oiis.data ? ' · last loaded selections shown' : ''}. <button onClick={() => oiis.refetch()}>Retry</button></p>}
        {!oiis.isLoading && !oiis.isError && !oiis.data?.runId && <p>No completed OIIS selection run today.</p>}
        {threeMonth.isLoading && <p role="status">Loading 3Month selections…</p>}
        {threeMonth.isError && <p role="alert">3Month strategy unavailable. <button onClick={() => threeMonth.refetch()}>Retry</button></p>}
        {!threeMonth.isLoading && !threeMonth.isError && threeMonth.data?.sessionDate !== today && <p className={styles.muted}>3Month latest session is {threeMonth.data?.sessionDate ?? 'unavailable'}; it is not counted as today.</p>}
        {progressionError ? <p role="alert">MWHD refresh failed{progression ? " · last loaded ranks retained" : ""}. {onProgressionRetry ? <button type="button" onClick={onProgressionRetry}>Retry</button> : null}</p>
          : <p className={styles.muted}>MWHD: {progressionRefreshing && progression ? "refreshing in place" : progression ? `response for ${progression.sessionDate}` : "loading"}. Only today’s confirmed intraday bars qualify; older ranks are context only.</p>}
        <section className={styles.consensus} aria-label="Selection consensus" data-testid="home-selection-consensus">
          <header><div><span>Today’s selection consensus</span><strong>{uniqueStocks} stocks · {rows.length} directional picks</strong></div><b>{maxAgreement || 0}/4 max agreement</b></header>
          {!rows.length ? <p>No current-session strategy or manual selection.</p> : <>
            <p className={styles.muted}>Highest agreement is shown first. A source counts once per stock and direction.</p>
            <div className={styles.consensusLeaders}>{consensus.map(row => <Link key={`${row.symbol}:${row.side}`} to={`/analytics/stock/${encodeURIComponent(row.symbol)}`} data-side={row.side.toLowerCase()}>
              <span><b>{row.symbol}</b><small>{row.side}</small></span><strong>{row.agreementCount}/4</strong><small>{row.sourceIds.map(id => tradingSourceLabels[id]).join(' · ')}</small>
            </Link>)}</div>
          </>}
        </section>
        <section className={styles.sourceSummary} aria-label="Selections by source" data-testid="home-selection-sources">
          <h3>Selected today by source</h3>
          {sourceRows.map(group => <details key={group.sourceId} open={group.sourceId === 'THREE_MONTH'}>
            <summary><b>{tradingSourceLabels[group.sourceId]}</b><span>{group.rows.length}</span></summary>
            {!group.rows.length ? <p>No current selection.</p> : <div className={styles.sourceChips}>{group.rows.map(row => <Link key={`${row.symbol}:${row.side}`} to={`/analytics/stock/${encodeURIComponent(row.symbol)}`} data-side={row.side.toLowerCase()}>{row.symbol}<small>{row.side}</small></Link>)}</div>}
          </details>)}
        </section>
        <section className={styles.funnel} aria-label="MWHD staged funnel" data-testid="home-mwhd-funnel">
          <h3>MWHD live funnel</h3>
          <p className={styles.muted}>Daily MWD qualification → hourly H → 15m → 5m. A failed stage is not evaluated deeper.</p>
          {([['BULL', bullFunnel], ['BEAR', bearFunnel]] as const).map(([label, funnel]) => <div className={styles.funnelLane} data-direction={label.toLowerCase()} key={label}>
            <b>{label}</b>{([['tracked','Tracked'],['mwd','MWD'],['hour','H'],['15m','15'],['5m','5']] as const).map(([key, text]) => <span key={key}><strong>{funnel[key]}</strong><small>{text}</small></span>)}
          </div>)}
          <div className={styles.funnelCandidates}>{stageCandidates.map(group => <div key={group.direction}>
            <strong>{group.direction === 'bull' ? 'Bull' : 'Bear'} passed · top 10</strong>
            {!group.rows.length && <small>No stock has passed MWD.</small>}
            {group.rows.map(({row,stage}) => <Link key={row.stock.symbol} data-stage={stage} data-direction={group.direction} to={`/analytics/stock/${encodeURIComponent(row.stock.symbol)}`}><b>#{directionalProgression(row, group.direction).rank} {row.stock.symbol}</b><span>{stageLabel[stage]}</span></Link>)}
          </div>)}</div>
        </section>
        {(['LONG','SHORT'] as const).map(direction => <section key={direction} aria-label={`${direction} stocks`}>
          <h3>{direction} · {rows.filter(row => row.side === direction).length}</h3>
          {!rows.some(row => row.side === direction) && <p>No selected or personal stocks in this direction.</p>}
          {rows.filter(row => row.side === direction).map(row => {
            const quote = universe.get(row.symbol); const rank = rankMap.get(row.symbol);
            const quoteDay = quote?.timestamp && Number.isFinite(Date.parse(quote.timestamp)) ? new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(quote.timestamp)) : null;
            return <article className={styles.row} key={`${row.symbol}:${row.side}`}>
              <div className={styles.identity}><Link to={`/analytics/stock/${encodeURIComponent(row.symbol)}`}>{row.symbol}</Link><span className={styles.agreement}>{row.agreementCount}/4 sources</span><b>₹{number(quote?.last)}</b></div>
              <div>{row.sources.join(' · ')}</div>
              <div className={styles.stats}><span>BULL #{rank?.rank ?? '—'}</span><span>BEAR #{rank?.bearRank ?? '—'}</span><span>{direction === 'LONG' ? rank?.best.pass ?? '—' : rank?.bearBest.pass ?? '—'} gates passed</span></div>
              {rank && (rank.best.pending > 0 || rank.bearBest.pending > 0) && <div className={styles.muted}>Rank has incomplete inputs; rank alone is not qualification.</div>}
              <div className={(quote?.changePct ?? 0) > 0 ? styles.positive : (quote?.changePct ?? 0) < 0 ? styles.negative : undefined}>{quoteDay === today ? 'Today' : 'Snapshot'} change: {number(quote?.changePct,'%')}</div>
              <div className={styles.muted}>Quote: {quoteDay ?? 'time unavailable'} · Rank intraday bar: {rank?.source.current5mStartedAt ?? 'unavailable'}</div>
              {row.sourceIds.includes('MANUAL') && <button onClick={() => save(personal.filter(pick => !(pick.symbol === row.symbol && pick.side === row.side)))}>Remove manual {direction.toLowerCase()}</button>}
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
          <strong>Add manual stock</strong><label>Stock symbol<input list="home-trading-symbols" value={symbol} onChange={event => setSymbol(event.target.value)} maxLength={40} required /></label>
          <datalist id="home-trading-symbols">{[...universe.keys()].sort().map(value => <option key={value} value={value} />)}</datalist>
          <label>Direction<select value={side} onChange={event => setSide(event.target.value as TradeSide)}><option value="LONG">Long</option><option value="SHORT">Short</option></select></label>
          <button type="submit">Add manual selection</button><p className={styles.muted}>Manual additions are saved per account on this browser, not synced between devices. Adding a stock never places an order.</p>
          <p role="status">{message}</p>
        </form>
        <Link to="/strategy/oiis-live">OIIS evidence</Link> · <Link to="/strategy/three-month">3Month evidence</Link> · <Link to="/strategy/scalper-dashboard">Monthly screener</Link>
      </div>
    </aside>}
  </>;
}
