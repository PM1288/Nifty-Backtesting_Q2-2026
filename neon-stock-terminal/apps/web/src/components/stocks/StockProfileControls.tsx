import { useMemo } from "react";
import type { StockProfile, StockProfileFilters } from "../../lib/stockProfiles";
import styles from "./StockProfileControls.module.css";

export function StockLogo({ symbol, profile, size = 28 }: { symbol: string; profile?: StockProfile; size?: number }) {
  return <span className={styles.logo} style={{ width: size, height: size }} aria-hidden="true">
    {profile ? <img src={profile.logoUrl} alt="" loading="lazy" /> : <b>{symbol.slice(0, 2)}</b>}
  </span>;
}
export function StockIdentity({ symbol, profile, compact = false }: { symbol: string; profile?: StockProfile; compact?: boolean }) {
  return <span className={styles.identity} data-stock-identity-symbol={symbol}><StockLogo symbol={symbol} profile={profile} size={compact ? 22 : 30} /><span><strong>{symbol}</strong>{!compact && profile ? <small>{profile.name}</small> : null}</span></span>;
}
export function StockUniverseFilterBar({ profiles, filters, onChange, count }: { profiles: StockProfile[]; filters: StockProfileFilters; onChange: (next: StockProfileFilters) => void; count: number }) {
  const sectors = useMemo(() => Array.from(new Set(profiles.map((item) => item.sector).filter(Boolean))).sort(), [profiles]);
  return <div className={styles.stickyFilters} aria-label="Stock classification filters">
    <strong>{count} visible</strong>
    <label>Universe<select value={filters.universe} onChange={(event) => onChange({ ...filters, universe: event.target.value })}><option value="ALL">All covered stocks</option><option value="FNO">NSE F&amp;O</option><option value="NIFTY50">NIFTY 50</option><option value="NIFTY100">NIFTY 100</option><option value="NIFTY250">NIFTY LargeMidcap 250</option><option value="NIFTY500">NIFTY 500</option></select></label>
    <label>Market cap<select value={filters.capBucket} onChange={(event) => onChange({ ...filters, capBucket: event.target.value })}><option value="ALL">All caps</option><option>Large Cap</option><option>Mid Cap</option><option>Small Cap</option></select></label>
    <label>Sector<select value={filters.sector} onChange={(event) => onChange({ ...filters, sector: event.target.value })}><option value="ALL">All sectors</option>{sectors.map((sector) => <option key={sector}>{sector}</option>)}</select></label>
    <button type="button" onClick={() => onChange({ universe: "ALL", capBucket: "ALL", sector: "ALL" })}>Clear</button>
  </div>;
}
export function StockDistribution({ profiles }: { profiles: StockProfile[] }) {
  const groups = [{ label: "NIFTY 50", value: profiles.filter((p) => p.nifty50).length }, { label: "NIFTY 100", value: profiles.filter((p) => p.nifty100).length }, { label: "LargeMidcap 250", value: profiles.filter((p) => p.largeMidcap250).length }, { label: "F&O", value: profiles.filter((p) => p.fno).length }, ...["Large Cap", "Mid Cap", "Small Cap"].map((label) => ({ label, value: profiles.filter((p) => p.capBucket === label).length }))];
  const max = Math.max(1, ...groups.map((item) => item.value));
  return <section className={styles.distribution}><header><div><span>STOCK MIX</span><h2>Where this evidence is concentrated</h2></div><small>Overlapping index memberships are shown independently.</small></header><div>{groups.map((item) => <article key={item.label}><span>{item.label}</span><b>{item.value}</b><i style={{ width: `${item.value / max * 100}%` }} /></article>)}</div></section>;
}
