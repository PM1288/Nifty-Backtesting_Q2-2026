import { useCallback, useEffect, useState, type FormEvent } from "react";
import { NavLink } from "react-router-dom";
import { useAuthGate } from "../auth/AuthGateProvider";
import { fetchOiisLiveCandidates, fetchOiisLiveDashboard, mutateOiisLive, type OiisLiveDashboard } from "../lib/api";
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

const GATE_GUIDE = [
  {
    code: "OFACTOR_BELOW_MINIMUM",
    meaning: "Directional opportunity score is below the governed minimum.",
    rule: "Selected-direction OFactor must be ≥ 54. LOW 54, MEDIUM 64, HIGH 74; the tier is retained.",
    fields: "ofactor, directional_edge, condition_results",
    source: "oiis_live.daily_candidate; component inputs from the OIIS feature snapshot"
  },
  {
    code: "NO_VALID_SETUP",
    meaning: "No recognised daily price/trend setup exists for the selected direction.",
    rule: "LONG/SHORT breakout or SMA20/SMA50 pullback structure, with volume_ratio_20 ≥ 1.2 or 90-day volume percentile ≥ 30%.",
    fields: "open/high/low/close, prior_high_20/prior_low_20, sma20, sma50, volume_ratio_20",
    source: "oiis_live.daily_candidate.condition_results; daily OHLCV/indicator feature tables"
  },
  {
    code: "INSUFFICIENT_LIQUIDITY",
    meaning: "The stock may not be tradable at the paper order size without unreliable execution.",
    rule: "Primary: volume_ratio_20 ≥ 0.75 and turnover percentile ≥ 10%. If unavailable, 90-day volume percentile must be ≥ 30%. Volume tiers 20/30/50% are always recorded.",
    fields: "volume_ratio_20, turnover_percentile, liquidity_tradability, liquidity_slippage_quality",
    source: "oiis_live.daily_candidate.condition_results; daily volume/turnover feature tables"
  },
  {
    code: "REWARD_RISK_BELOW_MINIMUM",
    meaning: "The available price path does not offer enough reward for the structural risk.",
    rule: "reward_risk must be ≥ 1.5; it is calculated from stop risk and room to the prior 20-day barrier.",
    fields: "close_price, structural_stop, risk_per_share, prior_high_20/prior_low_20, reward_risk",
    source: "oiis_live.daily_candidate.condition_results; OIIS daily feature snapshot"
  },
  {
    code: "EXCESSIVE_EXTENSION",
    meaning: "Price is already too far from its short-term trend to chase safely.",
    rule: "Fails when extension_atr > 1.5, where extension_atr = abs(close − SMA20) / ATR14.",
    fields: "close_price, sma20, atr14, extension_atr",
    source: "oiis_live.daily_candidate.condition_results; daily indicator feature tables"
  },
  {
    code: "DIRECTIONAL_EDGE_BELOW_MINIMUM",
    meaning: "Long and short opportunity scores are too close; direction is not decisive.",
    rule: "Absolute long-versus-short OFactor edge must be ≥ 6. LOW 6, MEDIUM 7, HIGH 8.",
    fields: "long_ofactor, short_ofactor, directional_edge",
    source: "oiis_live.daily_candidate; OIIS directional score components"
  },
  {
    code: "STOP_TOO_WIDE",
    meaning: "The structural stop is far away relative to normal volatility; this is currently diagnostic only.",
    rule: "risk_atr = risk_per_share / ATR14. Values > 2.5 are recorded but do not block selection.",
    fields: "structural_stop, risk_per_share, atr14, risk_atr",
    source: "oiis_live.daily_candidate.condition_results; daily OHLCV and ATR14"
  }
] as const;

export function OiisLivePage() {
  const { user, authReady, openAuthGate } = useAuthGate();
  const [data, setData] = useState<OiisLiveDashboard | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tradeDate, setTradeDate] = useState("");
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [view, setView] = useState<"summary" | "details">("summary");
  const [candidateSearch, setCandidateSearch] = useState("");
  const [candidates, setCandidates] = useState<Array<Record<string, any>>>([]);

  const load = useCallback(async (date?: string) => {
    try {
      setError("");
      const next = await fetchOiisLiveDashboard(date);
      setData(next);
      const details = await fetchOiisLiveCandidates(date || next.tradeDate || undefined);
      setCandidates(details.candidates);
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
  const filteredCandidates = candidates.filter((row) => {
    const query = candidateSearch.trim().toUpperCase();
    return !query || String(row.symbol ?? "").includes(query) || String(row.sector ?? "").toUpperCase().includes(query);
  });
  const setupStats = candidates.reduce((totals, row) => {
    const actual = row.gate_evidence?.NO_VALID_SETUP?.actual ?? {};
    if (!Object.keys(actual).length) return totals;
    if (row.direction === "LONG" && !actual.long_breakout) totals.longBreakout += 1;
    if (row.direction === "LONG" && !actual.long_pullback) totals.longPullback += 1;
    if (row.direction === "SHORT" && !actual.short_breakdown) totals.shortBreakdown += 1;
    if (row.direction === "SHORT" && !actual.short_pullback) totals.shortPullback += 1;
    if (!actual.volume_good) totals.volume += 1;
    return totals;
  }, { longBreakout: 0, longPullback: 0, shortBreakdown: 0, shortPullback: 0, volume: 0 });
  const funnelSteps = [
    ["Universe evaluated", evaluated, "All stocks with a completed daily evaluation"],
    ["Data quality ≥ 85", integer(funnel, "quality_pass"), "Reliable enough for the governed screen"],
    ["OFactor ≥ 54", integer(funnel, "ofactor_pass"), "LOW, MEDIUM or HIGH opportunity passed"],
    ["XFactor ≥ 76", integer(funnel, "xfactor_pass"), "Execution quality passed"],
    ["Hard gates clear", integer(funnel, "hard_gate_clear"), "No unresolved structural blocker"],
    ["Selected", selected, "Added to today’s governed watchlist"]
  ] as const;

  const detailsView = <section className={styles.panel}>
    <div className={styles.sectionHeading}>
      <div><span className={styles.kicker}>Full evidence ledger</span><h2>Every F&amp;O or NIFTY 50 stock evaluated</h2></div>
      <span className={styles.note}>{filteredCandidates.length} of {candidates.length} stocks · latest completed run</span>
    </div>
    <div className={styles.detailToolbar}>
      <input value={candidateSearch} onChange={(event) => setCandidateSearch(event.target.value)} placeholder="Search symbol or sector" aria-label="Search evaluated stocks" />
      <span>F&amp;O {value(data?.universe ?? {}, "fno")} · NIFTY 50 {value(data?.universe ?? {}, "nifty50")}</span>
    </div>
    <div className={styles.tableWrap}>
      <table className={`${styles.table} ${styles.detailTable}`}>
        <thead><tr><th>Rank / stock</th><th>Universe</th><th>Direction</th><th>OFactor</th><th>X / DQ</th><th>Directional edge</th><th>Volume</th><th>Extension / R:R</th><th>Failed gates</th><th>Evidence</th></tr></thead>
        <tbody>{filteredCandidates.map((row) => {
          const features = row.feature_values ?? {};
          const gates = row.gate_evidence ?? {};
          const longComponents = row.component_scores?.ofactor_long?.components ?? {};
          const shortComponents = row.component_scores?.ofactor_short?.components ?? {};
          const longWeights = row.component_scores?.ofactor_long?.weights ?? {};
          const shortWeights = row.component_scores?.ofactor_short?.weights ?? {};
          const longContributions = row.component_scores?.ofactor_long?.weighted_contributions ?? {};
          const shortContributions = row.component_scores?.ofactor_short?.weighted_contributions ?? {};
          return <tr key={row.candidate_id}>
            <td><strong>{row.recommendation_rank ? `#${row.recommendation_rank} ` : ""}{row.symbol}</strong><small>{value(row, "sector")}</small></td>
            <td><small>{row.universe_flags?.is_fno ? "F&O" : ""}{row.universe_flags?.is_fno && row.universe_flags?.is_nifty50 ? " + " : ""}{row.universe_flags?.is_nifty50 ? "NIFTY 50" : ""}</small></td>
            <td><span className={styles.pill} data-state={row.direction}>{value(row, "direction")}</span></td>
            <td><strong>{number(row, "ofactor", 2)}</strong><small>{value(row, "ofactor_level")} · L54 M64 H74</small></td>
            <td><strong>{number(row, "xfactor_snapshot", 2)} / {number(row, "data_quality", 2)}</strong><small>X ≥ 76 · DQ ≥ 85</small></td>
            <td><strong>{number(row, "directional_edge", 2)}</strong><small>{value(row, "directional_edge_level")} · L6 M7 H8</small></td>
            <td><strong>{number(features, "volume_current", 0)}</strong><small>20D ratio {number(features, "volume_ratio_20", 2)} · 90D pct {number(features, "volume_percentile_90", 2)}</small></td>
            <td><strong>{number(features, "extension_atr", 2)} / {number(features, "reward_risk", 2)}</strong><small>{value(row, "extension_level")} · R:R ≥ 1.5</small></td>
            <td><strong>{value(row, "failed_gate_count")}</strong><div className={styles.reasonList}>{reasons(row).map((reason) => <span key={reason}>{reason}</span>)}</div></td>
            <td><details className={styles.evidence}><summary>Inspect values</summary><div className={styles.evidenceGrid}>
              <div><b>Price</b><span>O/H/L/C {number(features,"open",2)} / {number(features,"high",2)} / {number(features,"low",2)} / {number(features,"close",2)}</span><span>SMA20 {number(features,"sma20",2)} · SMA50 {number(features,"sma50",2)} · ATR14 {number(features,"atr14",2)}</span><span>20D high {number(features,"prior_high_20",2)} · low {number(features,"prior_low_20",2)}</span></div>
              <div><b>Volume</b><span>Today {number(features,"volume_current",0)} · D-1 {number(features,"volume_previous_1d",0)} · D-2 {number(features,"volume_previous_2d",0)}</span><span>20D avg {number(features,"volume_average_20",0)} · 90D median {number(features,"volume_median_90",0)}</span><span>Ratio {number(features,"volume_ratio_20",3)} · 90D percentile {number(features,"volume_percentile_90",3)}</span></div>
              <div><b>Indicators</b><span>RSI14 {number(features,"rsi14",2)} · WILLR14 {number(features,"willr14",2)}</span><span>EMA61 {number(features,"ema61",2)} · MACD {number(features,"macd_line",3)}</span><span>Extension {number(features,"extension_atr",3)} ATR · risk {number(features,"risk_atr",3)} ATR · R:R {number(features,"reward_risk",3)}</span></div>
              <div><b>LONG OFactor components</b>{Object.entries(longComponents).map(([key, item]) => <span key={key}>{humanise(key)}: score {Number(item).toFixed(2)} · weight {Number(longWeights[key] ?? 0).toFixed(0)}% · contribution {Number(longContributions[key] ?? 0).toFixed(2)}</span>)}</div>
              <div><b>SHORT OFactor components</b>{Object.entries(shortComponents).map(([key, item]) => <span key={key}>{humanise(key)}: score {Number(item).toFixed(2)} · weight {Number(shortWeights[key] ?? 0).toFixed(0)}% · contribution {Number(shortContributions[key] ?? 0).toFixed(2)}</span>)}</div>
              <div><b>Gate calculations</b>{Object.entries(gates).map(([key, item]: [string, any]) => <span key={key} data-pass={item.passed ? "true" : "false"}>{humanise(key)}: {item.passed ? "PASS" : item.blocking ? "FAIL" : "RECORDED"} · {item.rule} · actual {JSON.stringify(item.actual)}</span>)}</div>
            </div></details></td>
          </tr>;
        })}</tbody>
      </table>
    </div>
  </section>;

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

      <div className={styles.viewTabs} role="tablist" aria-label="OIIS selection views">
        <button className={view === "summary" ? styles.viewTabActive : styles.viewTab} onClick={() => setView("summary")}>Summary</button>
        <button className={view === "details" ? styles.viewTabActive : styles.viewTab} onClick={() => setView("details")}>All stock details ({candidates.length})</button>
      </div>

      {view === "details" ? detailsView : <>

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

      <section className={styles.panel}>
        <div className={styles.sectionHeading}><div><span className={styles.kicker}>Tier and failure distribution</span><h2>What passed, and exactly where setups failed</h2></div><span className={styles.note}>Stop width is recorded but non-blocking; trigger confirmation is removed.</span></div>
        <div className={styles.summaryTiles}>
          <div><span>OFactor LOW 54–63.99</span><strong>{integer(funnel,"ofactor_low")}</strong></div>
          <div><span>OFactor MEDIUM 64–73.99</span><strong>{integer(funnel,"ofactor_medium")}</strong></div>
          <div><span>OFactor HIGH ≥74</span><strong>{integer(funnel,"ofactor_high")}</strong></div>
          {(data?.failureBuckets ?? []).map((row) => <div key={row.failed_gate_count}><span>{row.failed_gate_count} failed gate{Number(row.failed_gate_count) === 1 ? "" : "s"}</span><strong>{row.count}</strong></div>)}
        </div>
        <div className={styles.setupBreakdown}>
          <div><span>Long breakout absent</span><strong>{setupStats.longBreakout}</strong></div>
          <div><span>Long pullback absent</span><strong>{setupStats.longPullback}</strong></div>
          <div><span>Short breakdown absent</span><strong>{setupStats.shortBreakdown}</strong></div>
          <div><span>Short pullback absent</span><strong>{setupStats.shortPullback}</strong></div>
          <div><span>Good-volume confirmation absent</span><strong>{setupStats.volume}</strong></div>
        </div>
        <div className={styles.directionBreakdown}>{(data?.gateBreakdown ?? []).map((row) => <span key={`${row.reason}-${row.direction}`}><b>{humanise(row.reason)}</b> · {row.direction} {row.count}</span>)}</div>
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
          <div><span className={styles.kicker}>Gate definitions</span><h2>How each rejection is calculated</h2></div>
          <span className={styles.note}>Counts are for {tradeDate || "the selected trade date"}; reasons can overlap.</span>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Gate / count</th><th>What it means</th><th>Exact rule</th><th>Indicator fields evaluated</th><th>Evidence location</th></tr></thead>
            <tbody>{GATE_GUIDE.map((gate) => {
              const count = (data?.rejectionReasons ?? []).find((row) => row.reason === gate.code)?.count ?? 0;
              return <tr key={gate.code}>
                <td><strong>{humanise(gate.code)}</strong><small>{count} candidates</small></td>
                <td>{gate.meaning}</td>
                <td>{gate.rule}</td>
                <td><code>{gate.fields}</code></td>
                <td><small>{gate.source}</small></td>
              </tr>;
            })}</tbody>
          </table>
        </div>
        <div className={styles.ruleNote}><strong>How to read the counts</strong><p>A candidate may fail several gates, so these counts are not additive and can exceed the number of evaluated stocks. RSI14 and WILLR14 are shown as intraday entry context; the daily rejection gates above are evaluated first. A rejection means “do not trade today”, not that the stock will necessarily fall.</p></div>
      </section>

      <section className={styles.panel}>
        <div className={styles.sectionHeading}>
          <div><span className={styles.kicker}>Ranked list</span><h2>Top recommendations and entry permissions</h2></div>
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
      </>}
    </div>
  );
}
