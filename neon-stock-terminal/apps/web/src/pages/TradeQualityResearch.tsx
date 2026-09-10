import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getJson } from "../lib/api";
import styles from "./NiftyContextPage.module.css";

type Evidence = {
  signal_key: string;
  trade_date: string;
  entry_end: string;
  symbol: string;
  direction: "CALL" | "PUT";
  interval_minutes: number;
  expiry: string;
  strike: number | null;
  selected_option: string;
  lot_size: number | null;
  label: 0 | 1 | null;
  label_name: "GOOD_TRADE" | "NON_POSITIVE" | "UNAVAILABLE";
  maturity: string;
  pnl: null | { entry: number; exit: number; quantity: number; gross: number; charges: number; net: number; policy: string };
  comparative_pnl?: Record<"15m" | "30m" | "eod", Record<"ce" | "pe", Evidence["pnl"]>>;
  features: Record<string, number | null>;
  indicators: Record<string, Record<string, number | null>>;
  conditions: Record<string, unknown>;
  outcomes: Record<string, Record<string, unknown>>;
  input_complete: boolean;
  source_note: string;
};
type Row = {
  signal_key: string;
  evidence: Evidence;
  prediction: null | { probability_good_trade: number; actual_label: number; features: Record<string, number> };
  explanation: null | { units: string; base_value: number; output: number; feature_names: string[]; groups: string[]; contributions: number[] };
};
type Payload = {
  state: string;
  report: null | {
    run_id: string;
    reason: string;
    coverage: Record<string, number>;
    feature_coverage: Record<string, number>;
    limitations: string[];
    as_of_date?: string;
    window_start_date?: string;
    config: {
      label_policy: string;
      rolling_window_days?: number;
      schedule?: string;
      minimum_complete_rows?: number;
      minimum_sessions?: number;
      features: string[];
    };
  };
  rows: Row[];
  executionEnabled: false;
};

const number = (value: unknown, digits = 2) =>
  typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString("en-IN", { maximumFractionDigits: digits, minimumFractionDigits: digits })
    : "—";
const money = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 })
    : "—";
const outcome = (row: Evidence, horizon: string, instrument: string, field: string) => {
  const window = row.outcomes[horizon];
  const lane = window?.[instrument];
  return lane && typeof lane === "object" ? (lane as Record<string, unknown>)[field] : null;
};
const selectedLane = (row: Evidence) => row.direction === "CALL" ? "ce" : "pe";

function ComparativePnlCell({ item, leg, horizon }: { item: Evidence; leg: "ce" | "pe"; horizon: "15m" | "30m" | "eod" }) {
  const pnl = item.comparative_pnl?.[horizon]?.[leg] ?? null;
  return <td>
    <b className={pnl && pnl.net > 0 ? styles.positive : pnl ? styles.negative : ""}>{money(pnl?.net)}</b>
    <small>Gross {money(pnl?.gross)} · fees {money(pnl?.charges)}<br />
      Premium {money(pnl?.entry)} → {money(pnl?.exit)}<br />
      High {number(outcome(item, horizon, leg, "max"))} ({number(outcome(item, horizon, leg, "max_change_pct"))}%) · low {number(outcome(item, horizon, leg, "min"))} ({number(outcome(item, horizon, leg, "min_change_pct"))}%)
    </small>
  </td>;
}

function TradeWaterfall({ row }: { row: Row }) {
  if (!row.explanation || !row.prediction) return null;
  const items = row.explanation.feature_names.map((name, index) => ({
    name,
    value: row.prediction?.features[name],
    contribution: row.explanation?.contributions[index] ?? 0,
  })).sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  const scale = Math.max(...items.map((item) => Math.abs(item.contribution)), .000001);
  return <section className={styles.tradeExplanation} aria-label="Good-trade SHAP explanation">
    <h2>{row.evidence.symbol} · why the model estimated this outcome</h2>
    <p>{number(row.prediction.probability_good_trade * 100, 1)}% estimated good-trade probability · {row.explanation.units}</p>
    <div className={styles.factorBars}>
      {items.map((item) => <div key={item.name}>
        <span>{item.name.replaceAll("_", " ")} · input {number(item.value, 4)}</span>
        <i style={{ width: `${Math.max(2, Math.abs(item.contribution) / scale * 100)}%` }} data-sign={item.contribution >= 0 ? "positive" : "negative"} />
        <b>{item.contribution >= 0 ? "+" : ""}{number(item.contribution, 5)}</b>
      </div>)}
    </div>
  </section>;
}

function DailyFeatureImportance({ rows }: { rows: Row[] }) {
  const explained = rows.filter((row) => row.explanation && row.prediction);
  if (!explained.length) return null;
  const names = explained[0].explanation?.feature_names ?? [];
  const items = names.map((name, index) => ({
    name,
    value: explained.reduce((sum, row) => sum + Math.abs(row.explanation?.contributions[index] ?? 0), 0) / explained.length,
  })).sort((a, b) => b.value - a.value);
  const scale = Math.max(...items.map((item) => item.value), .000001);
  return <section className={styles.tradeExplanation} aria-label="Daily held-out SHAP feature importance">
    <h2>Daily held-out SHAP analysis</h2>
    <p>Mean absolute contribution across {explained.length} chronologically held-out trades. Raw log-odds influence, not profit and not percentage points.</p>
    <div className={styles.factorBars}>
      {items.map((item) => <div key={item.name}>
        <span>{item.name.replaceAll("_", " ")}</span>
        <i style={{ width: `${Math.max(2, item.value / scale * 100)}%` }} data-sign="positive" />
        <b>{number(item.value, 5)}</b>
      </div>)}
    </div>
  </section>;
}

export default function TradeQualityResearch() {
  const query = useQuery({
    queryKey: ["nifty-context", "trade-quality"],
    queryFn: () => getJson<Payload>("/v1/nifty-context/trade-quality"),
    staleTime: 60_000,
    retry: 1,
  });
  const [filter, setFilter] = useState("all");
  const [selectedKey, setSelectedKey] = useState("");
  const rows = useMemo(() => (query.data?.rows ?? []).filter((row) =>
    filter === "all" || (filter === "good" ? row.evidence.label === 1 : filter === "non-positive" ? row.evidence.label === 0 : row.evidence.label === null)),
    [filter, query.data?.rows]);
  const selected = rows.find((row) => row.signal_key === selectedKey) ?? rows[0];
  const exportEvidence = async () => {
    if (!query.data?.report) return;
    const payload = await getJson<unknown>(`/v1/nifty-context/trade-quality/export/${query.data.report.run_id}`);
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "maneesh-trade-quality-full-evidence.json";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  if (query.isLoading) return <p role="status">Loading trade-quality evidence…</p>;
  if (query.error) return <p role="alert">Trade-quality evidence is unavailable. Retry with Refresh.</p>;
  const data = query.data;
  if (!data?.report) return <p>No trade-quality experiment has completed yet.</p>;
  const hasShap = data.rows.some((row) => row.explanation && row.prediction);
  const eligibleRows = data.report.coverage.model_eligible_rows ?? 0;
  const requiredRows = data.report.config.minimum_complete_rows ?? 0;
  return <section data-testid="trade-quality-research" className={styles.tradeQuality}>
    <div className={styles.tradeHeading}>
      <div><h2>Daily 30-day good-trade SHAP research</h2><p>{data.state.replaceAll("_", " ")} · {data.report.reason}</p></div>
      <button onClick={() => void query.refetch()} disabled={query.isFetching}>Refresh</button>
      <button onClick={() => void exportEvidence()}>Export full evidence</button>
    </div>
    <div className={styles.status}>
      <p><b>Good trade:</b> exact selected option has positive one-lot net P&amp;L at 15 minutes after the versioned charge policy.</p>
      <p>Rolling {data.report.config.rolling_window_days ?? 30}-calendar-day research window · scheduled {data.report.config.schedule ?? "after 16:00 IST on trading days"} · as of {data.report.as_of_date ?? "—"}.</p>
      <p>Research-only quote path; not booked/executable P&amp;L. Future 15m/30m/EOD data is outcome evidence and is never a model input.</p>
    </div>
    <section className={styles.metrics} aria-label="Trade quality coverage" tabIndex={0}>
      {Object.entries(data.report.coverage).map(([name, value]) => <div key={name}><span>{name.replaceAll("_", " ")}</span><b>{number(value, 0)}</b></div>)}
    </section>
    {hasShap && <DailyFeatureImportance rows={data.rows} />}
    {!hasShap && <section className={styles.shapGate} aria-label="SHAP chart status" data-testid="shap-chart-gate">
      <div>
        <h2>SHAP chart status</h2>
        <b>Not calculated yet — evidence gate is still locked</b>
        <p>{eligibleRows} complete labelled trades of {requiredRows || "the required"} minimum are available. A genuine SHAP waterfall will appear automatically after chronological training has both outcome classes.</p>
        <p>Trade outcomes and input coverage remain visible below. No placeholder contribution, probability or synthetic feature importance is being shown as SHAP.</p>
      </div>
      <div className={styles.shapGateChart} role="img" aria-label={`SHAP unavailable: ${eligibleRows} of ${requiredRows} complete labelled trades`}>
        <span style={{ width: `${Math.min(100, requiredRows > 0 ? eligibleRows / requiredRows * 100 : 0)}%` }} />
        <strong>{eligibleRows} / {requiredRows || "—"} trades</strong>
      </div>
    </section>}
    <div className={styles.controls}>
      <label>Outcome <select value={filter} onChange={(event) => setFilter(event.target.value)}>
        <option value="all">All eligible trades</option><option value="good">Positive net P&amp;L</option>
        <option value="non-positive">Non-positive net P&amp;L</option><option value="unavailable">Unavailable outcome</option>
      </select></label>
      <span>{rows.length} matching rows</span>
    </div>
    <div className={styles.tradeTable} role="region" tabIndex={0} aria-label="Complete good-trade evidence table">
      <table>
        <thead><tr>
          <th>Trade</th><th>Selected outcome</th>
          <th>CE · 15m P&amp;L</th><th>CE · 30m P&amp;L</th><th>CE · EOD P&amp;L</th>
          <th>PE · 15m P&amp;L</th><th>PE · 30m P&amp;L</th><th>PE · EOD P&amp;L</th>
          <th>Underlying setup</th><th>Selected option setup</th>
          <th>Underlying RSI / MACD / signal / hist</th><th>Selected RSI / MACD / signal / hist</th>
          <th>Opposite RSI / MACD / signal / hist</th><th>Model / evidence</th>
        </tr></thead>
        <tbody>{rows.map((row) => {
          const item = row.evidence, lane = selectedLane(item);
          const u = item.indicators.underlying ?? {}, selectedIndicators = item.indicators[lane] ?? {};
          const oppositeIndicators = item.indicators[lane === "ce" ? "pe" : "ce"] ?? {};
          return <tr key={row.signal_key} data-selected={selected?.signal_key === row.signal_key}
            tabIndex={0} aria-label={`Inspect ${item.symbol} ${item.direction} trade evidence`}
            onClick={() => setSelectedKey(row.signal_key)}
            onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedKey(row.signal_key); } }}>
            <th>{item.symbol}<small>{item.trade_date} · {item.interval_minutes}m · {item.direction}<br />Selected {item.selected_option}<br />Qty {item.pnl?.quantity ?? "—"} · strike {number(item.strike)} · exp {item.expiry}</small></th>
            <td><b className={item.label === 1 ? styles.positive : item.label === 0 ? styles.negative : ""}>{item.label_name.replaceAll("_", " ")}</b><small>15m {item.maturity}<br />Selected 15m net {money(item.pnl?.net)}<br />Click row for all evidence</small></td>
            {(["ce", "pe"] as const).flatMap((leg) => (["15m", "30m", "eod"] as const).map((horizon) =>
              <ComparativePnlCell key={`${leg}-${horizon}`} item={item} leg={leg} horizon={horizon} />))}
            <td>Body {number(item.features.underlying_body_fraction != null ? item.features.underlying_body_fraction * 100 : null)}%<small>EMA distance {number(item.features.underlying_ema_distance_pct, 4)}% · entry gap {number(item.features.underlying_entry_gap_pct, 4)}%</small></td>
            <td>Body {number(item.features.option_body_fraction != null ? item.features.option_body_fraction * 100 : null)}%<small>EMA distance {number(item.features.option_ema_distance_pct, 4)}% · entry gap {number(item.features.option_entry_gap_pct, 4)}%</small></td>
            {[u, selectedIndicators, oppositeIndicators].map((values, index) => <td key={index}>{number(values.rsi14)} / {number(values.macd, 4)}<small>{number(values.macd_signal9, 4)} / {number(values.macd_histogram, 4)}</small></td>)}
            <td>{row.prediction ? `${number(row.prediction.probability_good_trade * 100, 1)}% good` : "SHAP pending"}<small>{item.input_complete ? "Inputs complete" : "Missing indicator input"}</small></td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    {selected && <>
      {selected.prediction && selected.explanation && <TradeWaterfall row={selected} />}
      <details key={selected.signal_key} className={styles.rawEvidence} open={selectedKey !== ""}><summary>Selected trade: all conditions, indicators and outcome evidence</summary><pre>{JSON.stringify(selected.evidence, null, 2)}</pre></details>
    </>}
    <details><summary>Feature availability and research limitations</summary>
      <ul>{data.report.limitations.map((item) => <li key={item}>{item}</li>)}</ul>
      <table><thead><tr><th>Entry-time feature</th><th>Available rows</th></tr></thead><tbody>
        {Object.entries(data.report.feature_coverage).map(([name, count]) => <tr key={name}><th>{name.replaceAll("_", " ")}</th><td>{count}</td></tr>)}
      </tbody></table>
    </details>
  </section>;
}
