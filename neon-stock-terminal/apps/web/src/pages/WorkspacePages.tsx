import { useEffect, useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuthGate } from "../auth/AuthGateProvider";
import styles from "./WorkspacePages.module.css";

type Payload = Record<string, any>;
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

function useWorkspaceData(path: string) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_BASE_URL}${path}`, { credentials: "include", signal: controller.signal, headers: { Accept: "application/json" } })
      .then(async (response) => {
        if (!response.ok) throw new Error(`API ${response.status}: ${await response.text()}`);
        return response.json();
      })
      .then(setData)
      .catch((reason) => { if (reason?.name !== "AbortError") setError(String(reason?.message ?? reason)); });
    return () => controller.abort();
  }, [path]);
  return { data, error };
}

function Page({ eyebrow, data, error, children }: { eyebrow: string; title: string; description: string; data: Payload | null; error: string | null; children: ReactNode }) {
  return <section className={styles.page} data-clarity-region={`workspace_${eyebrow.toLowerCase().replaceAll(" ", "_")}`}>
    {error ? <div className={styles.error}>{error}</div> : data ? children : <div className={styles.empty}>Loading verified workspace data…</div>}
  </section>;
}

const n = (value: unknown) => Number(value ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const money = (value: unknown) => `₹${n(value)}`;

export function PaperTradingPage() {
  const query = useWorkspaceData("/v1/workspace/paper-trading"); const s = query.data?.summary ?? {};
  return <Page eyebrow="Paper trading" title="Portfolio, execution and delivery" description="Actual paper positions, realised economics and webhook health. Analytical targets remain separate from execution closures." {...query}>
    <div className={styles.metrics}><Metric label="All trade groups" value={n(s.total_groups)} /><Metric label="Active groups" value={n(s.active_groups)} /><Metric label="Open positions" value={n(s.open_positions)} /><Metric label="Realised P&L" value={money(s.realised_pnl)} note={`Unrealised ${money(s.unrealised_pnl)}`} /></div>
    <div className={styles.grid}><Panel title="Recent paper trades"><Table rows={query.data?.recent ?? []} columns={["strategy_id","asset_class","status","opened_at","closed_at"]} /></Panel><Panel title="Execution state"><div className={styles.stack}>{(query.data?.statuses ?? []).map((x: any) => <div className={styles.row} key={x.status}><span>{x.status}</span><strong>{n(x.count)}</strong></div>)}<div className={styles.row}><span>Pending webhooks</span><strong>{n(s.pending_webhooks)}</strong></div></div></Panel></div>
  </Page>;
}

export function Nifty500Page() {
  const query = useWorkspaceData("/v1/workspace/nifty-500"); const s = query.data?.latest ?? {};
  return <Page eyebrow="NIFTY 500" title="Broad-market participation" description="Breadth, regime and participation show whether the index move is broadly supported or narrowly concentrated." {...query}>
    <div className={styles.metrics}><Metric label="Securities covered" value={n(s.securities_count)} /><Metric label="Advancers" value={n(s.advancers)} /><Metric label="Decliners" value={n(s.decliners)} /><Metric label="Market regime" value={String(s.market_regime ?? "Unavailable")} note={s.trade_date ? `Session ${String(s.trade_date).slice(0,10)}` : undefined} /></div>
    <Panel title="Last 30 sessions"><Table rows={query.data?.history ?? []} columns={["trade_date","securities_count","advancers","decliners","positive_ratio","nifty_return","market_regime"]} /></Panel>
  </Page>;
}

export function FuturesPage() {
  const query = useWorkspaceData("/v1/workspace/futures"); const rows = query.data?.rows ?? [];
  return <Page eyebrow="Futures" title="Participant positioning" description="NSE participant derivatives positioning, separated by client and instrument type. Use this as context, not as a standalone trade signal." {...query}>
    <div className={styles.metrics}><Metric label="Records loaded" value={n(rows.length)} /><Metric label="Latest session" value={rows[0]?.market_date ? String(rows[0].market_date).slice(0,10) : "—"} /><Metric label="Client groups" value={n(new Set(rows.map((x: any) => x.client_type)).size)} /><Metric label="Instrument types" value={n(new Set(rows.map((x: any) => x.instrument_type)).size)} /></div>
    <Panel title="Latest derivative participant records"><Table rows={rows} columns={["market_date","client_type","instrument_type","buy_contracts","sell_contracts","open_interest_long","open_interest_short"]} /></Panel>
  </Page>;
}

export function AdminPage() {
  const { user, authReady } = useAuthGate();
  if (authReady && user?.role !== "admin") return <Navigate to="/" replace />;
  return <AdminContent />;
}
function AdminContent() {
  const query = useWorkspaceData("/v1/workspace/control-plane");
  return <Page eyebrow="Administration" title="Database and platform control plane" description="Restricted operational evidence for the local administrator. Normal Firebase accounts cannot access this endpoint." {...query}>
    <div className={styles.metrics}><Metric label="Database" value={query.data?.database?.database_name ?? "—"} /><Metric label="Database size" value={query.data?.database?.database_size ?? "—"} /><Metric label="Connections" value={n(query.data?.activity?.connections)} /><Metric label="Active queries" value={n(query.data?.activity?.active_connections)} /></div>
    <Panel title="Authoritative schemas"><Table rows={query.data?.schemas ?? []} columns={["schemaname","table_count","total_size"]} /></Panel>
  </Page>;
}

function Metric({ label, value, note }: { label: string; value: string; note?: string }) { return <article className={styles.metric}><span>{label}</span><strong>{value}</strong>{note ? <small>{note}</small> : null}</article>; }
function Panel({ title, children }: { title: string; children: ReactNode }) { return <section className={styles.panel}><h2>{title}</h2>{children}</section>; }
function Table({ rows, columns }: { rows: any[]; columns: string[] }) { return <div className={styles.tableWrap}><table className={styles.table}><thead><tr>{columns.map((x) => <th key={x}>{x.replaceAll("_", " ")}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={row.trade_group_id ?? `${row.market_date ?? "row"}-${index}`}>{columns.map((column) => <td key={column}>{row[column] == null ? "—" : column === "status" ? <span className={styles.status}>{String(row[column])}</span> : String(row[column]).replace("T", " ").replace(/\.000Z$/, "")}</td>)}</tr>) : <tr><td colSpan={columns.length}>No records available.</td></tr>}</tbody></table></div>; }
