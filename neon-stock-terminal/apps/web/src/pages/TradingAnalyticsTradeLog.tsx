import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getJson } from "../lib/api";
import { evidenceCsv } from "../lib/tradingAnalyticsExport";
import styles from "./TradingAnalyticsPage.module.css";

type Row = Record<string, unknown>;
type Payload = { version: string; rows: Row[]; count: number; description: string; paperOrdersEnabled: false };
const object = (value: unknown): Row => value && typeof value === "object" ? value as Row : {};
const list = (value: unknown): Row[] => Array.isArray(value) ? value.map(object) : [];
const num = (value: unknown) => value == null || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
const value = (input: unknown, digits = 2) => num(input) == null ? "—" : num(input)!.toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const signed = (input: unknown, suffix = "") => num(input) == null ? "—" : `${num(input)! > 0 ? "+" : ""}${value(input)}${suffix}`;
const ist = (input: unknown) => typeof input !== "string" ? "—" : new Date(input).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const istTime = (input: unknown) => typeof input !== "string" ? "—" : new Date(input).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" });
const precursor = (input: unknown) => list(input).map((row, index) => `P${index + 1} ${row.colour ?? "—"} · ${row.close_vs_ema9 ?? "—"} EMA9`).join(" | ") || "—";

function downloadCsv(rows: Row[]) {
  const flat = rows.map((row) => {
    const conditions = object(row.condition_evidence), indicators = object(row.indicator_evidence), outcomes = object(row.outcome_evidence);
    const result: Row = { ...row };
    delete result.condition_evidence; delete result.indicator_evidence; delete result.outcome_evidence;
    result.underlying_precursors = precursor(conditions.underlying_precursors);
    result.option_precursors_context = precursor(conditions.selected_option_precursors);
    for (const name of ["underlying", "ce", "pe"]) {
      const data = object(indicators[name]);
      for (const key of ["rsi14", "macd", "macd_signal9", "macd_histogram"]) result[`${name}_${key}`] = data[key];
    }
    for (const horizon of ["15m", "30m", "eod"]) {
      const window = object(outcomes[horizon]);
      result[`${horizon}_maturity`] = window.maturity;
      for (const name of ["underlying", "ce", "pe"]) {
        const data = object(window[name]);
        for (const key of ["max", "max_at", "max_change", "max_change_pct", "min", "min_at", "min_change", "min_change_pct", "observed_minutes"]) result[`${horizon}_${name}_${key}`] = data[key];
      }
    }
    return result;
  });
  const url = URL.createObjectURL(new Blob([evidenceCsv(flat)], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = "maneesh-scalper-trade-observation-log.csv"; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function IndicatorCell({ evidence }: { evidence: unknown }) {
  const data = object(evidence);
  return <span className={styles.tradeLogStack}><b>RSI {value(data.rsi14)}</b><small>MACD {value(data.macd, 4)}</small><small>Signal {value(data.macd_signal9, 4)} · Hist {value(data.macd_histogram, 4)}</small></span>;
}

function OutcomeCell({ evidence }: { evidence: unknown }) {
  const window = object(evidence), ce = object(window.ce), pe = object(window.pe);
  return <span className={styles.tradeLogStack}>
    <b>{String(window.maturity ?? "DATA INSUFFICIENT").replaceAll("_", " ")}</b>
    <small>CE max {value(ce.max)} · {signed(ce.max_change)} ({signed(ce.max_change_pct, "%")})</small>
    <small>PE max {value(pe.max)} · {signed(pe.max_change)} ({signed(pe.max_change_pct, "%")})</small>
    <small>Max at CE {istTime(ce.max_at)} · PE {istTime(pe.max_at)} IST</small>
  </span>;
}

export function TradingAnalyticsTradeLog() {
  const [date, setDate] = useState("");
  const [interval, setInterval] = useState("");
  const [direction, setDirection] = useState("");
  const [search, setSearch] = useState("");
  const query = new URLSearchParams();
  if (date) query.set("date", date); if (interval) query.set("interval", interval); if (direction) query.set("direction", direction);
  const q = useQuery({ queryKey: ["scalper-trade-log", query.toString()], queryFn: () => getJson<Payload>(`/v1/trading-analytics/scalper-log?${query}`), staleTime: 30_000, refetchInterval: 60_000, retry: 1 });
  const rows = useMemo(() => (q.data?.rows ?? []).filter((row) => String(row.underlying_symbol ?? "").toUpperCase().includes(search.trim().toUpperCase())), [q.data, search]);
  return <section className={styles.tradeLog} aria-label="MANEESH scalper trade observation log">
    <header className={styles.toolbar}>
      <h2>Scalper trade observation log</h2><span>READ-ONLY · no broker or paper order</span>
      <label>Day <input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
      <label>Interval <select value={interval} onChange={(event) => setInterval(event.target.value)}><option value="">All</option><option value="1">1m</option><option value="5">5m</option><option value="15">15m</option></select></label>
      <label>Direction <select value={direction} onChange={(event) => setDirection(event.target.value)}><option value="">All</option><option>CALL</option><option>PUT</option></select></label>
      <label>Stock <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Symbol" /></label>
      <button disabled={q.isFetching} onClick={() => void q.refetch()}>{q.isFetching ? "Refreshing…" : "Refresh"}</button>
      <button disabled={!rows.length} onClick={() => downloadCsv(rows)}>Export full CSV</button>
    </header>
    <p className={styles.context}>{rows.length} observations · entry prices are next-candle opens · CE/PE maximum change is measured from its own entry open. Option precursor colours are context only.</p>
    {q.error && <p role="alert" className={styles.warning}>Trade observation evidence is unavailable. No value was replaced with zero.</p>}
    <div className={`${styles.tableWrap} ${styles.tradeLogTable}`} role="region" tabIndex={0} aria-label="Scalper entry and outcome evidence">
      <table><thead><tr><th>Day / Entry</th><th>Stock / Direction</th><th>Contracts</th><th>Entry values</th><th>Underlying conditions</th><th>Option precursor context</th><th>Underlying RSI / MACD</th><th>CE RSI / MACD</th><th>PE RSI / MACD</th><th>15 min max</th><th>30 min max</th><th>End of day max</th><th>Delivery / State</th></tr></thead>
      <tbody>{rows.map((row) => { const conditions = object(row.condition_evidence), indicators = object(row.indicator_evidence), outcomes = object(row.outcome_evidence); return <tr key={String(row.signal_key)}>
        <td><span className={styles.tradeLogStack}><b>{String(row.trade_date)}</b><small>{ist(row.entry_end)} IST</small><small>{String(row.interval_minutes)} minute</small></span></td>
        <td><span className={styles.tradeLogStack}><b>{String(row.underlying_symbol)} · {String(row.direction)}</b><small>Expiry {String(row.expiry)} · strike {value(row.strike)}</small><small>{String(row.rule_version)}</small></span></td>
        <td><span className={styles.tradeLogStack}><b>CE {String(row.ce_symbol)}</b><small>PE {String(row.pe_symbol)}</small><small>Selected {String(row.option_symbol)}</small></span></td>
        <td><span className={styles.tradeLogStack}><b>Underlying {value(row.underlying_entry_open)}</b><small>CE {value(row.ce_entry_open)} · PE {value(row.pe_entry_open)}</small><small>Setup U {value(row.underlying_setup_close)} · option {value(row.option_setup_close)}</small></span></td>
        <td><span className={styles.tradeLogStack}><b>{precursor(conditions.underlying_precursors)}</b><small>Body {signed(num(row.underlying_body_fraction) == null ? null : num(row.underlying_body_fraction)! * 100, "%")} · required</small><small>Next open gate passed</small></span></td>
        <td><span className={styles.tradeLogStack}><b>{precursor(conditions.selected_option_precursors)}</b><small>Context only · never rejects entry</small><small>Setup green · body {signed(num(row.option_body_fraction) == null ? null : num(row.option_body_fraction)! * 100, "%")}</small></span></td>
        <td><IndicatorCell evidence={indicators.underlying} /></td><td><IndicatorCell evidence={indicators.ce} /></td><td><IndicatorCell evidence={indicators.pe} /></td>
        <td><OutcomeCell evidence={outcomes["15m"]} /></td><td><OutcomeCell evidence={outcomes["30m"]} /></td><td><OutcomeCell evidence={outcomes.eod} /></td>
        <td><span className={styles.tradeLogStack}><b>{String(row.outcome_state).replaceAll("_", " ")}</b><small>WhatsApp {String(row.delivery_status)}</small><small>Updated {ist(row.outcome_updated_at)} IST</small></span></td>
      </tr>; })}</tbody></table>
      {!q.isLoading && !rows.length && <p>No signal observations match this day and filter. No synthetic rows are shown.</p>}
    </div>
  </section>;
}
