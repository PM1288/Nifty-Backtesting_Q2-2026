import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuthGate } from "../auth/AuthGateProvider";
import { getSessionCsrfToken, refreshCsrfToken } from "../lib/session";
import styles from "./WorkspacePages.module.css";

type Payload = Record<string, any>;
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

function useWorkspaceData(path: string) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    fetch(`${API_BASE_URL}${path}`, { credentials: "include", signal: controller.signal, headers: { Accept: "application/json" } })
      .then(async (response) => {
        if (!response.ok) throw new Error(`API ${response.status}: ${await response.text()}`);
        return response.json();
      })
      .then(setData)
      .catch((reason) => { if (reason?.name !== "AbortError") setError(String(reason?.message ?? reason)); });
    return () => controller.abort();
  }, [path, reloadKey]);
  return { data, error, reload: () => setReloadKey((value) => value + 1) };
}

function Page({ eyebrow, data, error, children }: { eyebrow: string; title: string; description: string; data: Payload | null; error: string | null; children: ReactNode }) {
  return <section className={styles.page} data-clarity-region={`workspace_${eyebrow.toLowerCase().replaceAll(" ", "_")}`}>
    {error ? <div className={styles.error}>{error}</div> : data ? children : <div className={styles.empty}>Loading verified workspace data…</div>}
  </section>;
}

const n = (value: unknown) => value == null || !Number.isFinite(Number(value)) ? "—" : Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const money = (value: unknown) => value == null || !Number.isFinite(Number(value)) ? "—" : `₹${n(value)}`;
const pct = (value: unknown) => value == null ? "—" : `${(Number(value) * 100).toFixed(2)}%`;
const at = (value: unknown) => value ? new Date(String(value)).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }) : "—";

function OperationalBar({ environment, asOf, state, detail }: { environment: string; asOf: unknown; state: string; detail: string }) {
  return <div className={styles.operationalBar}>
    <strong data-environment={environment}>{environment}</strong>
    <span><b>{state}</b>{detail}</span>
    <time dateTime={String(asOf ?? "")}>Updated {at(asOf)}</time>
  </div>;
}

export function PaperTradingPage() {
  const query = useWorkspaceData("/v1/workspace/paper-trading");
  const { user, authReady, openAuthGate } = useAuthGate();
  const [assetClass, setAssetClass] = useState<"EQUITY" | "OPTION">("EQUITY");
  const [symbol, setSymbol] = useState("");
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [quantity, setQuantity] = useState(1);
  const [orderType, setOrderType] = useState<"MARKET" | "LIMIT">("MARKET");
  const [limitPrice, setLimitPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitResult, setSubmitResult] = useState<string | null>(null);
  const s = query.data?.summary ?? {};
  const stockTrades = query.data?.stockTrades ?? [];

  async function submitManualTrade(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) { openAuthGate(); return; }
    setSubmitting(true); setSubmitError(null); setSubmitResult(null);
    const send = async () => {
      const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
      const csrf = getSessionCsrfToken();
      if (csrf) headers["X-CSRF-Token"] = csrf;
      return fetch(`${API_BASE_URL}/v1/workspace/paper-trading/manual-trades`, {
        method: "POST", credentials: "include", headers,
        body: JSON.stringify({ assetClass, symbol: symbol.trim().toUpperCase(), side, quantity, orderType, limitPrice: orderType === "LIMIT" ? Number(limitPrice) : undefined, notes })
      });
    };
    try {
      let response = await send();
      if (response.status === 403) { await refreshCsrfToken(); response = await send(); }
      const text = await response.text();
      if (!response.ok) throw new Error(`API ${response.status}: ${text}`);
      const result = JSON.parse(text) as Record<string, unknown>;
      setSubmitResult(`PAPER trade accepted · group ${String(result.trade_group_id ?? result.resource_id ?? "created")}`);
      setSymbol(""); setQuantity(1); setLimitPrice(""); setNotes("");
      query.reload();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : String(error));
    } finally { setSubmitting(false); }
  }

  return <Page eyebrow="Paper trading" title="Portfolio, execution and delivery" description="Actual paper positions, realised economics and webhook health. Analytical targets remain separate from execution closures." {...query}>
    <OperationalBar environment={String(query.data?.environment ?? "PAPER")} asOf={query.data?.asOf} state={Number(s.open_data_incidents) ? "DEGRADED" : "MONITORING"} detail={`${n(s.open_positions)} open positions · latest mark ${at(s.latest_mark_at)}`} />
    <div className={styles.metrics}>
      <Metric label="Open stock trades" value={n(stockTrades.length)} note={`${n(s.pending_entry_groups)} waiting to fill`} />
      <Metric label="Live unrealised P&L" value={money(s.unrealised_pnl)} note={`Marked ${at(s.latest_mark_at)}`} />
      <Metric label="Realised P&L" value={money(s.realised_pnl)} note={`${n(s.closed_groups)} trades closed`} />
      <Metric label="Target progress" value={`${n(s.completed_target_tracks)} / ${n(Number(s.completed_target_tracks ?? 0) + Number(s.active_target_tracks ?? 0))}`} note="Analytical tracks reached / total" />
    </div>
    <section className={styles.tradeBook}>
      <div className={styles.tradeBookHeading}><div><span>OPEN PAPER STOCKS</span><h2>Positions, targets and observation P&amp;L</h2></div><small>Actual execution and analytical potential are shown separately.</small></div>
      {stockTrades.length ? stockTrades.map((trade: any) => {
        const targets = Array.isArray(trade.targets) ? trade.targets : [];
        const horizons = Array.isArray(trade.horizons) ? trade.horizons : [];
        const horizon = (sessions: number) => horizons.find((item: any) => Number(item.horizon_sessions) === sessions);
        const direction = trade.side === "BUY" ? "LONG" : "SHORT";
        return <article className={styles.tradeCard} key={trade.trade_group_id} data-direction={direction}>
          <header className={styles.tradeCardHeader}>
            <div><span className={styles.direction} data-direction={direction}>{direction}</span><h3>{trade.symbol}</h3><small>{trade.strategy_id} · {trade.group_status}</small></div>
            <div className={styles.livePnl} data-sign={Number(trade.unrealised_pnl) > 0 ? "positive" : Number(trade.unrealised_pnl) < 0 ? "negative" : "flat"}><span>Live P&amp;L</span><strong>{money(trade.unrealised_pnl)}</strong><small>{pct(trade.current_return)}</small></div>
          </header>
          <div className={styles.tradeFacts}>
            <div><span>{trade.side === "BUY" ? "Bought" : "Shorted"}</span><strong>{at(trade.opened_at)}</strong></div>
            <div><span>Entry price</span><strong>{money(trade.average_entry_price)}</strong></div>
            <div><span>Current mark</span><strong>{money(trade.last_mark)}</strong><small>{at(trade.last_mark_at)}</small></div>
            <div><span>Open quantity</span><strong>{n(trade.remaining_quantity)}</strong></div>
            <div><span>Best move / MFE</span><strong>{pct(trade.mfe)}</strong></div>
            <div><span>Worst move / MAE</span><strong>{pct(trade.mae)}</strong></div>
          </div>
          <div className={styles.ladders}>
            <TargetLadder title="Intraday analytical ladder" targets={targets.filter((item: any) => item.lifecycle === "INTRADAY")} />
            <TargetLadder title="Swing analytical ladder" targets={targets.filter((item: any) => item.lifecycle === "SWING")} />
          </div>
          <div className={styles.horizons}>
            {[5,30].map((sessions) => {
              const result = horizon(sessions);
              return <div key={sessions}><span>{sessions}-session outcome</span><strong>{result?.status === "COMPLETED" ? pct(result.closing_return) : `${n(trade.sessions_observed)} / ${sessions} sessions`}</strong><small>{result?.status === "COMPLETED" ? `MFE ${pct(result.mfe)} · MAE ${pct(result.mae)} · after tax ${money(result.after_tax_pnl)}` : `Tracking · current MFE ${pct(trade.mfe)} · MAE ${pct(trade.mae)}`}</small></div>;
            })}
          </div>
        </article>;
      }) : <div className={styles.noTrades}><strong>No open paper stock positions</strong><span>Accepted trades waiting for a fill appear after the paper monitor receives the next eligible market bar.</span></div>}
    </section>
    <div className={styles.grid}>
      <Panel title="Add a manual paper trade">
        <form className={styles.tradeForm} onSubmit={submitManualTrade}>
          <label>Instrument type<select value={assetClass} onChange={(event) => setAssetClass(event.target.value as "EQUITY" | "OPTION")}><option value="EQUITY">NSE equity</option><option value="OPTION">NFO option</option></select></label>
          <label>{assetClass === "OPTION" ? "Full option trading symbol" : "Stock symbol"}<input value={symbol} onChange={(event) => setSymbol(event.target.value.toUpperCase())} placeholder={assetClass === "OPTION" ? "RELIANCE27AUG261400CE" : "RELIANCE"} required /></label>
          <label>Side<select value={side} onChange={(event) => setSide(event.target.value as "BUY" | "SELL")}><option value="BUY">Buy / Long</option><option value="SELL">Sell / Short</option></select></label>
          <label>{assetClass === "OPTION" ? "Lots" : "Shares"}<input type="number" min="0.0001" max="1000000" step="0.0001" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} required /></label>
          <label>Order type<select value={orderType} onChange={(event) => setOrderType(event.target.value as "MARKET" | "LIMIT")}><option value="MARKET">Market · next available bar</option><option value="LIMIT">Limit</option></select></label>
          {orderType === "LIMIT" ? <label>Limit price<input type="number" min="0.01" step="0.01" value={limitPrice} onChange={(event) => setLimitPrice(event.target.value)} required /></label> : null}
          <label className={styles.tradeNotes}>Notes<input value={notes} maxLength={500} onChange={(event) => setNotes(event.target.value)} placeholder="Optional operator note" /></label>
          <div className={styles.paperGuard}><strong>PAPER only</strong><span>This creates no broker order. The paper monitor applies the configured fill model.</span></div>
          <button className={styles.tradeSubmit} type="submit" disabled={submitting || !authReady}>{submitting ? "Submitting…" : user ? "Add paper trade" : "Sign in to add trade"}</button>
          {submitResult ? <p className={styles.success}>{submitResult}</p> : null}
          {submitError ? <p className={styles.formError}>{submitError}</p> : null}
        </form>
      </Panel>
      <Panel title="Execution state"><div className={styles.stack}>{(query.data?.statuses ?? []).map((x: any) => <div className={styles.row} key={x.status}><span>{x.status}</span><strong>{n(x.count)}</strong></div>)}</div></Panel>
    </div>
    <Panel title="Recent paper trade history"><Table rows={query.data?.recent ?? []} columns={["strategy_id","asset_class","status","remaining_units","realised_pnl","unrealised_pnl","opened_at","closed_at","last_mark_at"]} /></Panel>
    <div className={styles.gridBalanced}>
      <Panel title="Independent analytical tracks"><div className={styles.stack}>{(query.data?.targetStatuses ?? []).map((x: any) => <div className={styles.row} key={x.status}><span>{x.status}</span><strong>{n(x.count)}</strong></div>)}</div></Panel>
      <Panel title="Market-data incidents"><Table rows={query.data?.incidents ?? []} columns={["incident_type","status","count","latest_detected_at"]} /></Panel>
    </div>
  </Page>;
}

function TargetLadder({ title, targets }: { title: string; targets: any[] }) {
  return <section><h4>{title}</h4><div>{targets.map((target) => {
    const hit = target.status === "CLOSED_AT_TARGET" || target.status === "HIT";
    const missed = target.status === "NOT_HIT_INTRADAY" || target.status === "TIMED_OUT";
    return <article key={`${target.lifecycle}-${target.target_pct}`} data-state={hit ? "hit" : missed ? "missed" : "active"}>
      <span>+{(Number(target.target_pct) * 100).toFixed(Number(target.target_pct) < 0.01 ? 1 : 0)}%</span>
      <strong>{money(target.target_price)}</strong>
      <small>{hit ? `Hit ${at(target.first_hit_at)}` : missed ? "Not reached" : "Tracking"}</small>
    </article>;
  })}</div></section>;
}

export function Nifty500Page() {
  const query = useWorkspaceData("/v1/workspace/nifty-500"); const s = query.data?.latest ?? {};
  return <Page eyebrow="Market breadth history" title="Broad-market participation" description="This source may cover more than the current NIFTY 500 membership. The count shown is the actual stored universe, not an index-membership claim." {...query}>
    <OperationalBar environment="MARKET" asOf={query.data?.asOf} state={String(s.market_regime ?? "UNKNOWN")} detail={s.trade_date ? `Session ${String(s.trade_date).slice(0,10)}` : "No qualified session"} />
    <div className={styles.metrics}><Metric label="Securities covered" value={n(s.securities_count)} /><Metric label="Advancers" value={n(s.advancers)} /><Metric label="Decliners" value={n(s.decliners)} /><Metric label="Market regime" value={String(s.market_regime ?? "Unavailable")} note={s.trade_date ? `Session ${String(s.trade_date).slice(0,10)}` : undefined} /></div>
    <Panel title="Last 30 sessions"><Table rows={query.data?.history ?? []} columns={["trade_date","securities_count","advancers","decliners","positive_ratio","nifty_return","market_regime"]} /></Panel>
  </Page>;
}

export function FuturesPage() {
  const query = useWorkspaceData("/v1/workspace/futures"); const rows = query.data?.participantRows ?? query.data?.rows ?? []; const contracts = query.data?.contracts ?? [];
  const near = contracts.filter((row: any) => Number(row.expiry_rank) === 1);
  const quoted = near.filter((row: any) => row.futures_price != null && row.spot_price != null);
  const averageBasis = quoted.length ? quoted.reduce((sum: number, row: any) => sum + Number(row.basis_pct), 0) / quoted.length : null;
  const shortBuildup = near.filter((row: any) => row.buildup === "SHORT_BUILDUP").length;
  return <Page eyebrow="Futures" title="Futures basis, OI and roll" description="Current and next contracts are read from the live contract master. Participant records remain available as advanced context rather than dominating the decision view." {...query}>
    <OperationalBar environment="DERIVATIVES" asOf={query.data?.asOf} state={quoted.length ? "AVAILABLE" : "INCOMPLETE"} detail={`${n(quoted.length)} / ${n(near.length)} near contracts have spot and futures quotes`} />
    <div className={styles.metrics}><Metric label="Near contracts" value={n(near.length)} note={`${n(contracts.length-near.length)} next-expiry contracts archived`} /><Metric label="Average basis" value={averageBasis == null ? "—" : `${n(averageBasis)}%`} note="Unweighted, current near contracts" /><Metric label="Short build-up" value={n(shortBuildup)} note="Price down and OI up" /><Metric label="Participant report" value={rows[0]?.market_date ? String(rows[0].market_date).slice(0,10) : "—"} note="Dated context, not live positioning" /></div>
    <Panel title="Current and next futures contracts"><Table rows={contracts.slice(0,80)} columns={["underlying","tradingsymbol","expiry","futures_price","spot_price","basis","annualised_basis_pct","open_interest","oi_change_pct","volume","buildup","last_seen_ts"]} /></Panel>
    <Panel title="Advanced participant positioning"><Table rows={rows} columns={["market_date","client_type","instrument_type","buy_contracts","sell_contracts","open_interest_long","open_interest_short"]} /></Panel>
  </Page>;
}

export function AdminPage() {
  const { user, authReady } = useAuthGate();
  if (authReady && user?.role !== "admin") return <Navigate to="/" replace />;
  return <AdminContent />;
}
function AdminContent() {
  const query = useWorkspaceData("/v1/workspace/control-plane");
  const collector = query.data?.collector ?? {};
  return <Page eyebrow="Administration" title="Database and platform control plane" description="Restricted operational evidence for the local administrator. Normal Firebase accounts cannot access this endpoint." {...query}>
    <OperationalBar environment="ADMIN" asOf={query.data?.asOf} state={query.data ? "CONNECTED" : "CHECKING"} detail={query.data?.database?.database_name ?? "Database identity pending"} />
    <div className={styles.metrics}><Metric label="Database" value={query.data?.database?.database_name ?? "—"} /><Metric label="Database size" value={query.data?.database?.database_size ?? "—"} /><Metric label="Connections" value={n(query.data?.activity?.connections)} /><Metric label="Active queries" value={n(query.data?.activity?.active_connections)} /></div>
    <Panel title="SmartAPI collector status">
      <div className={styles.metrics}>
        <Metric label="Safety mode" value={String(collector.mode ?? "UNKNOWN")} note="No broker order path" />
        <Metric label="Active subscriptions" value={n(collector.activeSubscriptions)} note="Across broker WebSockets" />
        <Metric label="REST throttles · 1 hour" value={n(collector.throttleCount)} note="Should remain zero" />
        <Metric label="Raw archive drops" value={n(collector.archiveDropped)} note="Cumulative since collector start" />
      </div>
      <Table rows={collector.sockets ?? []} columns={["connection_id","status","subscriptions_count","last_tick_ts","sequence_gaps","archive_dropped","ts"]} />
    </Panel>
    <div className={styles.gridBalanced}>
      <Panel title="Collector data freshness"><Table rows={collector.freshness ?? []} columns={["dataset","latest_at","estimated_rows"]} /></Panel>
      <Panel title="Rate-governed REST activity"><Table rows={collector.requests ?? []} columns={["endpoint","requests","successes","failures","throttles","average_latency_ms","latest_request_at"]} /></Panel>
    </div>
    <Panel title="Subscription coverage"><Table rows={collector.subscriptions ?? []} columns={["kind","mode","active","count"]} /></Panel>
    <Panel title="Authoritative schemas"><Table rows={query.data?.schemas ?? []} columns={["schemaname","table_count","total_size"]} /></Panel>
  </Page>;
}

function Metric({ label, value, note }: { label: string; value: string; note?: string }) { return <article className={styles.metric}><span>{label}</span><strong>{value}</strong>{note ? <small>{note}</small> : null}</article>; }
function Panel({ title, children }: { title: string; children: ReactNode }) { return <section className={styles.panel}><h2>{title}</h2>{children}</section>; }
function formatCell(column: string, value: unknown) {
  if (value == null) return "—";
  if (column.endsWith("_at") || column === "market_date" || column === "trade_date") return at(value);
  if (column.includes("pnl")) return money(value);
  if (["positive_ratio", "nifty_return"].includes(column)) return `${n(Number(value) * (Math.abs(Number(value)) <= 1 ? 100 : 1))}%`;
  return String(value);
}
function Table({ rows, columns }: { rows: any[]; columns: string[] }) {
  return <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Operational data table">
    <table className={styles.table}>
      <thead><tr>{columns.map((x) => <th key={x}>{x.replaceAll("_", " ")}</th>)}</tr></thead>
      <tbody>{rows.length ? rows.map((row, index) => <tr key={row.trade_group_id ?? `${row.market_date ?? row.incident_type ?? "row"}-${index}`}>{columns.map((column) => <td key={column}>{column === "status" ? <span className={styles.status}>{String(row[column] ?? "UNKNOWN")}</span> : formatCell(column, row[column])}</td>)}</tr>) : <tr><td colSpan={columns.length}>No records available.</td></tr>}</tbody>
    </table>
  </div>;
}
