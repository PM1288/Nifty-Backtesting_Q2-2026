import { useEffect, useRef, useState } from 'react';
import { scalperFreshness, type ScalperSession } from '../../lib/scalperV2Freshness';

export function ScalperV2Freshness({ sessions, observations, interval, historical, symbol, failed }: {
  sessions: ScalperSession[]; observations: { name: string; end: string | null }[];
  interval: number; historical: boolean; symbol: string; failed: boolean;
}) {
  const [now, setNow] = useState(Date.now);
  const [permission, setPermission] = useState(() => typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
  const sent = useRef('');
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(id); }, []);
  const status = historical ? { state: 'historical', message: 'Historical session selected' }
    : failed ? { state: 'stale', message: 'Chart refresh failed. Retrying every minute; displayed prices may be delayed.' }
    : scalperFreshness(sessions, observations, interval, now);
  useEffect(() => {
    if (status.state !== 'stale') { sent.current = ''; return; }
    const key = `${symbol}:${status.message}`;
    if (sent.current === key || permission !== 'granted') return;
    try {
      new Notification(`${symbol} · Scalper data alert`, { body: status.message, tag: `scalper-data-${symbol}` });
      sent.current = key;
    } catch { /* Persistent in-page alert remains available when browser notifications are unsupported. */ }
  }, [symbol, status.state, status.message, permission]);
  return <div data-testid="v2-data-freshness" data-state={status.state} role={status.state === 'stale' || status.state === 'unknown' ? 'alert' : 'status'} style={{ padding: '6px 10px', background: status.state === 'stale' ? '#fff0f2' : '#f1f5f9', color: status.state === 'stale' ? '#b42336' : '#475569' }}>
    {status.message}{!historical && permission === 'default' && <button style={{ marginLeft: 12 }} onClick={() => void Notification.requestPermission().then(setPermission)}>Enable data alerts</button>}
    {!historical && permission === 'denied' && <span> · Browser alerts blocked; data alerts remain visible here.</span>}
  </div>;
}
