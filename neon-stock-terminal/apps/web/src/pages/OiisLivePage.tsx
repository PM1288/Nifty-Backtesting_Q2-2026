import { useCallback, useEffect, useState, type FormEvent } from "react";
import { NavLink } from "react-router-dom";
import { useAuthGate } from "../auth/AuthGateProvider";
import { fetchOiisLiveDashboard, mutateOiisLive, type OiisLiveDashboard } from "../lib/api";
import { STRATEGY_SECTION_TABS } from "./AnalyticsChrome";
import styles from "./OiisLivePage.module.css";

const empty = { symbol: "", active: true, entryEnabled: false, rsiMax: 30, willrMax: -80, notes: "" };

function value(row: Record<string, any>, key: string) {
  const item = row[key];
  return item == null || item === "" ? "—" : String(item);
}

function number(row: Record<string, any>, key: string, digits = 2) {
  const item = Number(row[key]);
  return Number.isFinite(item) ? item.toFixed(digits) : "—";
}

function integer(row: Record<string, any> | null | undefined, key: string) {
  const item = Number(row?.[key]);
  return Number.isFinite(item) ? Math.round(item) : 0;
}

function money(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount)
    : "—";
}

function dateOnly(value: unknown) {
  return typeof value === "string" ? value.slice(0, 10) : "—";
}

function humanise(value: unknown) {
  return String(value ?? "Unknown")
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

function reasons(row: Record<string, any>) {
  return Array.isArray(row.reason_codes) ? row.reason_codes.map(humanise).slice(0, 2) : [];
}

export function OiisLivePage() {
  const { user, authReady, openAuthGate } = useAuthGate();
  const [data, setData] = useState<OiisLiveDashboard | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tradeDate, setTradeDate] = useState("");
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<string | null>(null);

  const load = useCallback(async (date?: string) => {
    try {
      setError("");
      const next = await fetchOiisLiveDashboard(date);
      setData(next);
      if (next.tradeDate) setTradeDate(next.tradeDate);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(tradeDate || undefined), 30_000);
    return () => window.clearInterval(timer);
  }, [load, tradeDate]);

  const requireOperator = () => {
    if (user) return true;
    openAuthGate();
    return false;
  };

  const run = async (command: string) => {
    if (!requireOperator()) return;
    setBusy(true);
    try {
      await mutateOiisLive("/commands", "POST", { command });
      await load(tradeDate);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!requireOperator()) return;
    setBusy(true);
    try {
      await mutateOiisLive(editing ? `/watchlist/${editing}` : "/watchlist", editing ? "PATCH" : "POST", {
        ...form,
        tradeDate
      });
      setEditing(null);
      setForm(empty);
      await load(tradeDate);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  const edit = (row: Record<string, any>) => {
    if (!requireOperator()) return;
    setEditing(String(row.watchlist_item_id));
    setForm({
      symbol: String(row.symbol),
      active: Boolean(row.active),
      entryEnabled: Boolean(row.entry_enabled),
      rsiMax: Number(row.rsi_max),
      willrMax: Number(row.willr_max),
      notes: String(row.notes ?? "")
    });
  };

  const remove = async (id: string) => {
    if (!requireOperator()) return;
    setBusy(true);
    try {
      await mutateOiisLive(`/watchlist/${id}`, "DELETE");
      await load(tradeDate);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  const watch = data?.watchlist ?? [];
  const nearMisses = data?.nearMisses ?? [];
  const funnel = data?.funnel ?? {};
  const latestRun = (data?.runs ?? []).find((row) => dateOnly(row.trade_date) === tradeDate) ?? data?.runs?.[0] ?? {};
  const evaluated = integer(funnel, "evaluated");
  const selected = integer(funnel, "selected");
  const accepted = (data?.entries ?? []).filter((row) => row.status === "ACCEPTED" || row.status === "FILLED").length;
  const historicalSummary = data?.historical?.summary ?? {};
  const primaryBlocker = data?.rejectionReasons?.[0];
  const noTrade = evaluated > 0 && selected === 0;
  const funnelSteps = [
    ["Universe evaluated", evaluated, "All stocks with a completed daily evaluation"],
    ["Data quality ≥ 85", integer(funnel, "quality_pass"), "Reliable enough for the governed screen"],
    ["OFactor ≥ 74", integer(funnel, "ofactor_pass"), "Directional opportunity passed"],
    ["XFactor ≥ 76", integer(funnel, "xfactor_pass"), "Execution quality passed"],
    ["Hard gates clear", integer(funnel, "hard_gate_clear"), "No unresolved structural blocker"],
    ["Selected", selected, "Added to today’s governed watchlist"]
  ] as const;

  return (
    <div className={styles.page}>
      <header className={styles.workspaceHeader}>
        <div>
          <span className={styles.eyebrow}>Strategy workspace · Paper only</span>
          <h1>Daily stock selection desk</h1>
          <p>See what OIIS evaluated, what passed, what failed and which names are closest to becoming actionable.</p>
        </div>
        <nav className={styles.tabs} aria-label="Strategy workspace">
          {STRATEGY_SECTION_TABS.map((tab) => (
            <NavLink key={tab.to} to={tab.to} end={tab.to === "/strategy/oiis-live"} className={({ isActive }) => isActive ? styles.tabActive : styles.tab}>
              <span>{tab.badge}</span>{tab.label}
            </NavLink>
          ))}
        </nav>
      </header>

      {error && <div className={styles.error}>{error}</div>}

      <section className={styles.decisionHero} data-state={noTrade ? "no-trade" : selected > 0 ? "selected" : "waiting"}>
        <div>
          <span className={styles.decisionLabel}>{noTrade ? "NO TRADE DECISION" : selected > 0 ? "WATCHLIST READY" : "WAITING FOR EVALUATION"}</span>
          <h2>{noTrade ? `No stock cleared every gate for ${tradeDate}` : selected > 0 ? `${selected} stock${selected === 1 ? "" : "s"} selected for ${tradeDate}` : "Selection evidence is loading"}</h2>
          <p>{noTrade ? `${evaluated} stocks were evaluated. The engine rejected weak or structurally unsafe entries instead of forcing a trade.${primaryBlocker ? ` The most common blocker was ${humanise(primaryBlocker.reason)} (${primaryBlocker.count} stocks).` : ""}` : "A selected stock is monitored for the first RSI < 30 and Williams %R < −80 trigger, once per stock per day."}</p>
        </div>
        <div className={styles.decisionMeta}>
          <span>Signal date<strong>{dateOnly(latestRun.signal_date)}</strong></span>
          <span>Trade date<strong>{tradeDate || "—"}</strong></span>
          <span>Run status<strong>{value(latestRun, "status")}</strong></span>
        </div>
      </section>

      <section className={styles.funnelSection}>
        <div className={styles.sectionHeading}>
          <div><span className={styles.kicker}>Selection funnel</span><h2>Where the universe narrowed</h2></div>
          <span className={styles.refresh}>Auto-refreshes every 30 seconds</span>
        </div>
        <div className={styles.funnel}>
          {funnelSteps.map(([label, count, note], index) => (
            <article className={styles.funnelCard} key={label} data-final={index === funnelSteps.length - 1 ? "true" : "false"}>
              <span className={styles.step}>0{index + 1}</span>
              <strong>{count}</strong>
              <h3>{label}</h3>
              <p>{note}</p>
            </article>
          ))}
        </div>
      </section>

      <div className={styles.analysisGrid}>
        <section className={styles.panel}>
          <div className={styles.sectionHeading}>
            <div><span className={styles.kicker}>Closest opportunities</span><h2>Top near-miss candidates</h2></div>
            <span className={styles.note}>Research context—not trade permission</span>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Stock</th><th>Readiness</th><th>O / X / DQ</th><th>Daily indicators</th><th>Buy reference</th><th>Why it failed</th></tr></thead>
              <tbody>{nearMisses.map((row) => <tr key={row.candidate_id}>
                <td><strong>{row.symbol}</strong><small>{value(row, "sector")}</small></td>
                <td><span className={styles.score}>{number(row, "readiness_score", 0)}</span></td>
                <td><span className={styles.metricLine}><b>{number(row, "ofactor", 1)}</b><b>{number(row, "xfactor_snapshot", 1)}</b><b>{number(row, "data_quality", 1)}</b></span></td>
                <td><small>RSI {number(row, "rsi14", 1)}</small><small>WILLR {number(row, "willr14", 1)}</small></td>
                <td><strong>{money(row.buy_limit)}</strong><small>No chase {money(row.no_chase_price)}</small></td>
                <td><div className={styles.reasonList}>{reasons(row).map((reason) => <span key={reason}>{reason}</span>)}</div></td>
              </tr>)}</tbody>
            </table>
          </div>
        </section>

        <aside className={styles.panel}>
          <div className={styles.sectionHeading}><div><span className={styles.kicker}>Gate pressure</span><h2>Why stocks were rejected</h2></div></div>
          <div className={styles.reasonBars}>
            {(data?.rejectionReasons ?? []).map((row) => {
              const width = evaluated ? Math.max(4, (Number(row.count) / evaluated) * 100) : 0;
              return <div className={styles.reasonBar} key={row.reason}>
                <div><span>{humanise(row.reason)}</span><strong>{row.count}</strong></div>
                <i><b style={{ width: `${Math.min(100, width)}%` }} /></i>
              </div>;
            })}
          </div>
          <div className={styles.ruleNote}><strong>No trade is a valid result.</strong><p>OIIS does not promote a stock merely because its O score is high. XFactor, data permission and every hard gate must agree.</p></div>
        </aside>
      </div>

      <section className={styles.panel}>
        <div className={styles.sectionHeading}>
          <div><span className={styles.kicker}>Actionable list</span><h2>Stocks selected for entry monitoring</h2></div>
          <div className={styles.levelLegend}><span>High {integer(funnel, "high_count")}</span><span>Medium {integer(funnel, "medium_count")}</span><span>Low {integer(funnel, "low_count")}</span></div>
        </div>
        {watch.length ? <div className={styles.tableWrap}><table className={styles.table}>
          <thead><tr><th>Rank</th><th>Stock</th><th>Level</th><th>O / X / DQ</th><th>Buy reference</th><th>Entry trigger</th><th>Paper state</th><th>Actions</th></tr></thead>
          <tbody>{watch.map((row) => <tr key={row.watchlist_item_id}><td>{value(row, "rank")}</td><td><strong>{row.symbol}</strong><small>{value(row, "sector")}</small></td><td><span className={styles.pill} data-state={row.daily_level}>{value(row, "daily_level")}</span></td><td><span className={styles.metricLine}><b>{number(row, "ofactor", 1)}</b><b>{number(row, "xfactor_snapshot", 1)}</b><b>{number(row, "data_quality", 1)}</b></span></td><td>{money(row.buy_limit)}</td><td>RSI &lt; {number(row, "rsi_max", 1)} · WILLR &lt; {number(row, "willr_max", 1)}</td><td><span className={styles.pill} data-state={row.entry_status}>{value(row, "entry_status")}</span></td><td><button className={styles.textButton} onClick={() => edit(row)}>Edit</button><button className={styles.textDanger} onClick={() => void remove(String(row.watchlist_item_id))}>Remove</button></td></tr>)}</tbody>
        </table></div> : <div className={styles.emptyState}><span>0</span><div><strong>No governed candidates today</strong><p>This is not missing data: {evaluated} daily evaluations are visible above. Review the near misses, but do not convert them into automatic trades.</p></div></div>}
      </section>

      <div className={styles.lowerGrid}>
        <section className={styles.panel}>
          <div className={styles.sectionHeading}><div><span className={styles.kicker}>Operator tools</span><h2>Manage the paper watchlist</h2></div><span className={user ? styles.authenticated : styles.readOnly}>{user ? "Operator session active" : "Read-only mode"}</span></div>
          {!user && <button className={styles.signInCallout} type="button" onClick={openAuthGate} disabled={!authReady}><strong>Sign in to make changes</strong><span>Viewing and diagnostics remain available without login. Selection runs and watchlist edits require an operator session.</span></button>}
          <div className={styles.toolbar}><label>Date<select value={tradeDate} onChange={(event) => { setTradeDate(event.target.value); void load(event.target.value); }}>{(data?.availableDates ?? []).map((row) => { const date = dateOnly(row.trade_date); return <option key={date}>{date}</option>; })}</select></label><button className={styles.button} disabled={busy || !user} onClick={() => void run("RUN_SELECTION")}>Run selection</button><button className={styles.buttonSecondary} disabled={busy || !user} onClick={() => void run("RECONCILE")}>Reconcile</button></div>
          <form className={styles.editor} onSubmit={submit}><label>Symbol<input value={form.symbol} disabled={Boolean(editing) || !user} onChange={(event) => setForm({ ...form, symbol: event.target.value.toUpperCase() })} required /></label><label>RSI below<input type="number" step="0.1" value={form.rsiMax} disabled={!user} onChange={(event) => setForm({ ...form, rsiMax: Number(event.target.value) })} /></label><label>WILLR below<input type="number" step="0.1" value={form.willrMax} disabled={!user} onChange={(event) => setForm({ ...form, willrMax: Number(event.target.value) })} /></label><label>Notes<input value={form.notes} disabled={!user} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label><label className={styles.check}><input type="checkbox" checked={form.active} disabled={!user} onChange={(event) => setForm({ ...form, active: event.target.checked })} />Active</label><label className={styles.check}><input type="checkbox" checked={form.entryEnabled} disabled={!user} onChange={(event) => setForm({ ...form, entryEnabled: event.target.checked })} />Entry enabled</label><button className={styles.button} disabled={busy || !user}>{editing ? "Save changes" : "Add monitor"}</button>{editing && <button type="button" className={styles.buttonSecondary} onClick={() => { setEditing(null); setForm(empty); }}>Cancel</button>}</form>
        </section>

        <section className={styles.panel}>
          <div className={styles.sectionHeading}><div><span className={styles.kicker}>Historical context</span><h2>Latest three-year evaluation</h2></div></div>
          <div className={styles.historyMetrics}><div><span>Candidate days</span><strong>{value(data?.historical ?? {}, "candidate_count")}</strong></div><div><span>Qualified</span><strong>{value(data?.historical ?? {}, "qualified_candidate_count")}</strong></div><div><span>Triggered trades</span><strong>{value(data?.historical ?? {}, "triggered_trade_count")}</strong></div><div><span>After provision</span><strong>{money(historicalSummary.after_tax_pnl)}</strong></div></div>
          <p className={styles.historyFootnote}>{dateOnly(data?.historical?.start_date)} to {dateOnly(data?.historical?.end_date)} · Unconstrained research paths, not a finite-capital portfolio return.</p>
        </section>
      </div>

      <section className={styles.panel}>
        <div className={styles.sectionHeading}><div><span className={styles.kicker}>System trust</span><h2>Live services and data freshness</h2></div><span className={styles.note}>Accepted entries: {accepted}</span></div>
        <div className={styles.healthGrid}>{(data?.diagnostics ?? []).map((row) => <div className={styles.healthItem} key={row.service_name}><div><strong>{value(row, "service_name")}</strong><span>Updated {value(row, "age_seconds")}s ago</span></div><span className={styles.pill} data-state={row.status}>{row.status}</span></div>)}</div>
        <div className={styles.freshnessGrid}><div><span>Latest minute bar</span><strong>{value(data?.freshness ?? {}, "latest_minute_bar")}</strong></div><div><span>NSE EOD / stock regime</span><strong>{dateOnly(data?.freshness?.latest_nse_eod)} / {dateOnly(data?.freshness?.latest_stock_regime)}</strong></div><div><span>Paper webhooks pending</span><strong>{value(data?.queues ?? {}, "paper_outbox_pending")}</strong></div><div><span>OIIS errors pending</span><strong>{value(data?.queues ?? {}, "oiis_errors_pending")}</strong></div></div>
      </section>
    </div>
  );
}
