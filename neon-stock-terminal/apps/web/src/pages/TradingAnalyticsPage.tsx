import { lazy, Suspense, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { getJson } from "../lib/api";
import type { EChartsOption } from "echarts";
import styles from "./TradingAnalyticsPage.module.css";
import { TradingAnalyticsScalper } from "./TradingAnalyticsScalper";
import { evidenceCsv } from "../lib/tradingAnalyticsExport";

const Chart = lazy(async () => ({
  default: (await import("../components/visual/EChartSurface")).EChartSurface,
}));
type Row = Record<string, unknown>;
type Payload = {
  version: string;
  asOf: string;
  reportDate: string;
  availableDates: string[];
  state: string;
  evidenceId: string;
  activity: Row[];
  participants: Row[];
  issues: Row[];
  errors: Row[];
  candles: Row[];
  policies: Row[];
  limitations: string[];
  morning: {
    matrix: string;
    cash: Row[];
    knowledgeState: string;
    reportLagDays: number;
  };
  chain: {
    snapshot: Row | null;
    previousSnapshot: Row | null;
    expiries: string[];
    legs: Row[];
    strikes: number[];
    shortfall: number;
    metrics: {
      oiPcr: number | null;
      volumePcr: number | null;
      maxPainStrikes: number[];
      normalizationState: string;
    };
    ageSeconds: number | null;
    state: string;
    scope: string;
    archivedLegCount: number;
  };
};
const tabs = {
  morning: "Morning Brief",
  activity: "FII Activity",
  participants: "Participant OI",
  options: "NIFTY Options",
  scalper: "Scalper / Exact Contracts",
  structure: "Price & EMA",
  replay: "History / Replay",
  health: "Policy & Data Health",
} as const;
type Tab = keyof typeof tabs;
export function display(v: unknown) {
  if (v == null || v === "") return "—";
  if (typeof v === "object") return JSON.stringify(v);
  if (typeof v === "number")
    return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 8 }).format(
      v,
    );
  return String(v);
}
function download(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Table({
  rows,
  columns,
  label,
}: {
  rows: Row[];
  columns: [string, string][];
  label: string;
}) {
  return (
    <div
      className={styles.tableWrap}
      tabIndex={0}
      role="region"
      aria-label={`${label} scroll area`}
    >
      <table aria-label={label}>
        <thead>
          <tr>
            {columns.map(([k, l]) => (
              <th key={k}>{l}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {columns.map(([k]) => (
                <td key={k} title={display(r[k])}>
                  {display(r[k])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && (
        <p>No observations available for this source and as-of time.</p>
      )}
    </div>
  );
}
function Plot({ option, label }: { option: EChartsOption; label: string }) {
  return (
    <section className={styles.plot} aria-label={label}>
      <Suspense fallback={<p>Loading chart…</p>}>
        <Chart className={styles.chart} ariaLabel={label} option={option} />
      </Suspense>
    </section>
  );
}
function OiChart({ legs }: { legs: Row[] }) {
  const option = useMemo<EChartsOption>(
    () => ({
      animation: false,
      tooltip: { trigger: "axis" },
      legend: { data: ["CE OI", "PE OI"] },
      grid: { left: 65, right: 20, bottom: 50 },
      xAxis: {
        type: "category",
        name: "Strike",
        data: [...new Set(legs.map((l) => String(l.strike)))],
      },
      yAxis: { type: "value", name: "Source OI" },
      series: ["CE", "PE"].map((t, i) => ({
        name: `${t} OI`,
        type: "bar",
        data: legs
          .filter((l) => l.option_type === t)
          .map((l) =>
            l.open_interest == null ? null : Number(l.open_interest),
          ),
        itemStyle: { color: i ? "#087a55" : "#c93346" },
      })),
    }),
    [legs],
  );
  return (
    <Plot
      label="Current CE and PE OI by strike; retained display window only"
      option={option}
    />
  );
}
const activityColumns: [string, string][] = [
  ["fii_derivatives", "Product"],
  ["family_total", "Family total"],
  ["buy_contracts", "Buy contracts"],
  ["sell_contracts", "Sell contracts"],
  ["net_contracts", "Net contracts"],
  ["buy_value_in_cr", "Buy ₹ crore"],
  ["sell_value_in_cr", "Sell ₹ crore"],
  ["net_crore", "Net ₹ crore"],
  ["open_contracts", "EOD OI contracts"],
  ["open_contracts_value_in_cr", "EOD ₹ crore"],
  ["legacy_sign", "Legacy sign"],
  ["canonical_sign", "Canonical sign"],
  ["loaded_at", "Known / loaded at"],
  ["source_file", "Source"],
];
const peopleColumns: [string, string][] = [
  ["client_type", "Participant"],
  ["future_index_long", "Index fut long"],
  ["future_index_short", "Index fut short"],
  ["net_futures", "Net fut contracts"],
  ["futures_long_pct", "Futures long %"],
  ["net_calls", "Net calls"],
  ["net_puts", "Net puts"],
  ["options_proxy", "Options count proxy"],
  ["legacy_options_label", "Legacy >50 contracts"],
  ["legacy_futures_label", "Legacy >50%"],
  ["total_long_contracts", "Reported total long"],
  ["total_short_contracts", "Reported total short"],
];
const optionColumns: [string, string][] = [
  ["instrument_identifier", "Exact contract"],
  ["strike", "Strike"],
  ["option_type", "Right"],
  ["last_price", "LTP ₹"],
  ["bid_price", "Bid ₹"],
  ["bid_qty", "Bid qty"],
  ["ask_price", "Ask ₹"],
  ["ask_qty", "Ask qty"],
  ["total_traded_volume", "Volume (source)"],
  ["open_interest", "OI (source)"],
  ["change_in_oi", "Provider day ΔOI"],
  ["previous_snapshot_delta", "Prior snapshot ΔOI"],
  ["implied_volatility", "IV (source)"],
  ["delta", "Delta"],
  ["gamma", "Gamma"],
  ["theta", "Theta"],
  ["vega", "Vega"],
];

export function TradingAnalyticsPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = Object.hasOwn(tabs, params.get("view") ?? "")
    ? (params.get("view") as Tab)
    : "morning";
  const [replayInput, setReplayInput] = useState(params.get("asOf") ?? "");
  const query = new URLSearchParams();
  for (const k of ["date", "expiry", "asOf"])
    if (params.get(k)) query.set(k, params.get(k)!);
  const q = useQuery({
    queryKey: ["trading-analytics", query.toString()],
    queryFn: () => getJson<Payload>(`/v1/trading-analytics?${query}`),
    staleTime: 30000,
    retry: 1,
  });
  const change = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next);
  };
  const d = q.data;
  if (import.meta.env.VITE_TRADING_ANALYTICS_ENABLED === "false")
    return (
      <section>
        Trading Analytics is disabled.{" "}
        <Link to="/strategy/nifty-options">NIFTY Options</Link>
      </section>
    );
  return (
    <section className={styles.page} aria-label="Trading Analytics workspace">
      <header className={styles.toolbar}>
        <h1>Trading Analytics</h1>
        <span>READ-ONLY · Research preview</span>
        <Link to="/strategy/nifty-options">Existing NIFTY strategy</Link>
        <button disabled={q.isFetching} onClick={() => void q.refetch()}>
          {q.isFetching ? "Refreshing…" : "Refresh"}
        </button>
        {d && (
          <>
            <label>
              Report{" "}
              <select
                value={d.reportDate}
                onChange={(e) => change("date", e.target.value)}
              >
                {d.availableDates.map((date) => (
                  <option key={date}>{date}</option>
                ))}
              </select>
            </label>
            <button
              onClick={() =>
                download(
                  `trading-analytics-${d.reportDate}.json`,
                  JSON.stringify(d, null, 2),
                  "application/json",
                )
              }
            >
              Full evidence JSON
            </button>
          </>
        )}
      </header>
      <nav className={styles.tabs} aria-label="Trading analytics lenses">
        {Object.entries(tabs).map(([id, label]) => (
          <button
            key={id}
            aria-current={tab === id ? "page" : undefined}
            onClick={() => change("view", id)}
          >
            {label}
          </button>
        ))}
      </nav>
      {d && !["scalper", "replay"].includes(tab) && (
        <button
          onClick={() => {
            const rows =
              tab === "options"
                ? d.chain.legs
                : tab === "participants"
                  ? d.participants
                  : tab === "structure"
                    ? d.candles
                    : tab === "health"
                      ? d.issues
                      : d.activity;
            download(
              `trading-analytics-${tab}-${d.reportDate}.csv`,
              evidenceCsv(rows),
              "text/csv;charset=utf-8",
            );
          }}
        >
          Export source rows CSV
        </button>
      )}
      {q.error && (
        <section role="alert" className={styles.warning}>
          Could not refresh evidence.{" "}
          {q.error instanceof Error ? q.error.message : "Request failed"}{" "}
          <button onClick={() => void q.refetch()}>Retry</button>
        </section>
      )}
      {!d ? (
        <p role="status">
          {q.isLoading
            ? "Loading retained research evidence…"
            : "No evidence response."}
        </p>
      ) : (
        <>
          <section className={styles.warning}>
            <strong>{d.state}</strong> · No paper or broker orders. Report{" "}
            {d.reportDate} ({d.morning.reportLagDays} calendar days old) · Chain{" "}
            {d.chain.state} · {d.issues.length} reconciliation issues ·{" "}
            {d.errors.length} source query failures.{" "}
            <Link to="?view=health">Inspect blockers</Link>
          </section>
          {tab === "morning" && (
            <>
              <div className={styles.journey}>
                {[
                  "1 Previous-session activity",
                  "2 Outstanding positions",
                  "3 Underlying price",
                  "4 Exact option confirmation",
                  "5 OI context",
                  "6 Research evidence",
                ].map((v, i) => (
                  <button
                    key={v}
                    onClick={() =>
                      change(
                        "view",
                        (
                          [
                            "activity",
                            "participants",
                            "structure",
                            "options",
                            "options",
                            "health",
                          ] as Tab[]
                        )[i],
                      )
                    }
                  >
                    {v}
                  </button>
                ))}
              </div>
              <section>
                <h2>Morning hypothesis: {d.morning.matrix}</h2>
                <p>
                  Cash plus aggregate INDEX FUTURES and INDEX OPTIONS. Same-day
                  activity is not outstanding positions; an improving proxy is
                  not entry authorization.
                </p>
                <p>
                  {d.morning.knowledgeState.replaceAll("_", " ")} · Missing cash
                  or unmapped sign combinations remain explicit.
                </p>
              </section>
              <Table
                label="Activity summary"
                rows={d.activity.filter((r) =>
                  [
                    "INDEX FUTURES",
                    "INDEX OPTIONS",
                    "STOCK FUTURES",
                    "STOCK OPTIONS",
                  ].includes(String(r.fii_derivatives)),
                )}
                columns={activityColumns.slice(0, 9)}
              />
              <Table
                label="Participant positioning summary"
                rows={d.participants.filter((p) => p.client_type !== "TOTAL")}
                columns={peopleColumns.slice(0, 8)}
              />
            </>
          )}
          {tab === "activity" && (
            <>
              <h2>Daily FII derivatives activity</h2>
              <p>
                ₹ crore values: options strike × quantity, NOT premium flow.
                Family totals and component products are alternate aggregation
                levels.
              </p>
              <Table
                label="Full FII activity"
                rows={d.activity}
                columns={activityColumns}
              />
              <Plot
                label="Net reported activity in INR crore, family totals only"
                option={{
                  animation: false,
                  tooltip: { trigger: "axis" },
                  xAxis: {
                    type: "category",
                    data: d.activity
                      .filter((r) =>
                        [
                          "INDEX FUTURES",
                          "INDEX OPTIONS",
                          "STOCK FUTURES",
                          "STOCK OPTIONS",
                        ].includes(String(r.fii_derivatives)),
                      )
                      .map((r) => String(r.fii_derivatives)),
                  },
                  yAxis: { type: "value", name: "₹ crore" },
                  series: [
                    {
                      type: "bar",
                      data: d.activity
                        .filter((r) =>
                          [
                            "INDEX FUTURES",
                            "INDEX OPTIONS",
                            "STOCK FUTURES",
                            "STOCK OPTIONS",
                          ].includes(String(r.fii_derivatives)),
                        )
                        .map((r) =>
                          r.net_crore == null ? null : Number(r.net_crore),
                        ),
                    },
                  ],
                }}
              />
            </>
          )}
          {tab === "participants" && (
            <>
              <h2>Outstanding participant positions</h2>
              <p>
                Client is the reported class, not verified retail. TOTAL is a
                reconciliation row, not a fifth participant. Changes need a
                verified preceding-session report.
              </p>
              <Table
                label="Participant derived metrics"
                rows={d.participants}
                columns={peopleColumns}
              />
              <details>
                <summary>Full source positions and provenance</summary>
                <Table
                  label="All participant source fields"
                  rows={d.participants}
                  columns={[
                    ...new Set(d.participants.flatMap((r) => Object.keys(r))),
                  ].map((k) => [k, k])}
                />
              </details>
              <Plot
                label="Participant net index futures contracts"
                option={{
                  animation: false,
                  xAxis: {
                    type: "category",
                    data: d.participants
                      .filter((r) => r.client_type !== "TOTAL")
                      .map((r) => String(r.client_type)),
                  },
                  yAxis: { type: "value", name: "Contracts" },
                  tooltip: { trigger: "axis" },
                  series: [
                    {
                      type: "bar",
                      data: d.participants
                        .filter((r) => r.client_type !== "TOTAL")
                        .map((r) =>
                          r.net_futures == null ? null : Number(r.net_futures),
                        ),
                    },
                  ],
                }}
              />
            </>
          )}
          {tab === "options" && (
            <>
              <div className={styles.toolbar}>
                <h2>NIFTY option evidence</h2>
                <label>
                  Expiry{" "}
                  <select
                    value={String(d.chain.snapshot?.expiry_date ?? "")}
                    onChange={(e) => change("expiry", e.target.value)}
                  >
                    {d.chain.expiries.map((e) => (
                      <option key={e}>{e}</option>
                    ))}
                  </select>
                </label>
                <span>
                  {d.chain.strikes.length}/10 paired strikes ·{" "}
                  {d.chain.archivedLegCount} archived legs
                </span>
              </div>
              <p>
                Provider: {display(d.chain.snapshot?.source)} · Snapshot{" "}
                {display(d.chain.snapshot?.captured_at)} · Baseline{" "}
                {display(d.chain.previousSnapshot?.captured_at)}. OI is the
                provider-reported value; normalized units await verification.
              </p>
              <div className={styles.kpis}>
                <span>
                  Window OI PCR{" "}
                  <strong>{display(d.chain.metrics.oiPcr)}</strong>
                </span>
                <span>
                  Window volume PCR{" "}
                  <strong>{display(d.chain.metrics.volumePcr)}</strong>
                </span>
                <span>
                  Max pain{" "}
                  <strong>
                    {d.chain.metrics.maxPainStrikes.join(", ") || "—"}
                  </strong>
                </span>
                <span>
                  Missing pairs <strong>{d.chain.shortfall}</strong>
                </span>
              </div>
              <p>
                {d.chain.metrics.normalizationState.replaceAll("_", " ")}. This
                window is not the full exchange chain.
              </p>
              <Table
                label="NIFTY ten CE and ten PE contract evidence"
                rows={d.chain.legs}
                columns={optionColumns}
              />
              {d.chain.legs.length > 0 && <OiChart legs={d.chain.legs} />}
            </>
          )}
          {tab === "structure" && (
            <>
              <h2>NIFTY completed daily candles and own-series EMA9</h2>
              <p>
                SMA of first nine retained closes seeds EMA9; warm-up remains
                blank. Range and body fractions are descriptive previews.
                Daily/weekly level policies remain unapproved. The Scalper lens
                shows synchronized exact-option intraday panes and their coverage.
              </p>
              <Plot
                label="NIFTY daily OHLC and EMA9; underlying scale in points"
                option={{
                  animation: false,
                  tooltip: { trigger: "axis" },
                  legend: { data: ["NIFTY", "EMA9"] },
                  grid: { left: 70, right: 20, bottom: 65 },
                  xAxis: {
                    type: "category",
                    data: d.candles.map((b) => String(b.date)),
                  },
                  yAxis: { type: "value", scale: true, name: "Index points" },
                  dataZoom: [{ type: "inside" }, { type: "slider", bottom: 0 }],
                  series: [
                    {
                      name: "NIFTY",
                      type: "candlestick",
                      data: d.candles.map((b) => [
                        Number(b.open),
                        Number(b.close),
                        Number(b.low),
                        Number(b.high),
                      ]),
                    },
                    {
                      name: "EMA9",
                      type: "line",
                      showSymbol: false,
                      data: d.candles.map((b) =>
                        b.ema9 == null ? null : Number(b.ema9),
                      ),
                      lineStyle: { color: "#d97706", width: 1.5 },
                    },
                  ],
                }}
              />
              <details>
                <summary>Accessible candle data / exact values</summary>
                <Table
                  label="Daily OHLC and EMA source"
                  rows={d.candles}
                  columns={[
                    ["date", "Date"],
                    ["open", "Open"],
                    ["high", "High"],
                    ["low", "Low"],
                    ["close", "Close"],
                    ["ema9", "EMA9"],
                    ["fraction", "Above / below fractions"],
                    ["source", "Source"],
                    ["created_at", "Recorded at"],
                  ]}
                />
              </details>
            </>
          )}
          {tab === "replay" && (
            <>
              <h2>Retained-source as-of inspection</h2>
              <p>
                This is not a trading-profit backtest. Unknown historical
                publication revisions, expired-contract gaps and mutable source
                bars restrict point-in-time claims.
              </p>
              <label>
                ISO as-of timestamp{" "}
                <input
                  value={replayInput}
                  placeholder="2026-09-07T06:00:00+05:30"
                  onChange={(e) => setReplayInput(e.target.value)}
                />
              </label>
              <button onClick={() => change("asOf", replayInput)}>
                Load as-of
              </button>
              <button
                onClick={() => {
                  setReplayInput("");
                  change("asOf", "");
                }}
              >
                Return to current
              </button>
              <p>
                Evaluated {d.asOf}. Source event/recorded timestamps are
                filtered before calculation; this does not prove missing
                historical publication time.
              </p>
              <details>
                <summary>Complete immutable export candidate</summary>
                <pre>{JSON.stringify(d, null, 2)}</pre>
              </details>
            </>
          )}
          {tab === "scalper" && (
            <TradingAnalyticsScalper
              asOf={d.asOf}
              expiry={String(d.chain.snapshot?.expiry_date ?? "")}
              strikes={d.chain.strikes}
              spot={
                d.chain.snapshot?.underlying_value == null
                  ? null
                  : Number(d.chain.snapshot.underlying_value)
              }
            />
          )}
          {tab === "health" && (
            <>
              <h2>Source reconciliation and approval gates</h2>
              <Table
                label="Reconciliation issues"
                rows={d.issues}
                columns={[
                  ["code", "Check"],
                  ["unit", "Unit"],
                  ["reported", "Reported"],
                  ["calculated", "Reconstructed"],
                  ["difference", "Difference"],
                ]}
              />
              <Table
                label="Source query failures"
                rows={d.errors}
                columns={[
                  ["source", "Source"],
                  ["state", "State"],
                ]}
              />
              <Table
                label="Policy register"
                rows={d.policies}
                columns={[
                  ["id", "Policy"],
                  ["state", "State"],
                  ["reason", "Reason"],
                ]}
              />
              <ul>
                {d.limitations.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
              <p>
                Formula {d.version} · Evidence digest {d.evidenceId}
              </p>
            </>
          )}
        </>
      )}
    </section>
  );
}
