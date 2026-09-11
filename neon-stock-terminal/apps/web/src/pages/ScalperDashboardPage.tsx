import { Fragment, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getScalperProgressionExcelUrl } from "../lib/api";
import { fmtPrice, formatDateIST } from "../lib/format";
import { useScalperProgression } from "../lib/hooks";
import type { ScalperProgressionRow } from "../lib/types";
import {
  SCALPER_CONDITION_CODES,
  scalperConditionLabel,
  scalperConditionStates,
  scalperScore,
  type ScalperConditionCode,
  type ScalperConditionState,
} from "../lib/scalperDashboard";
import styles from "./ScalperDashboardPage.module.css";

type StateFilter = "ALL" | ScalperConditionState;
const EMPTY_ROWS: ScalperProgressionRow[] = [];

const PERIODS: Array<{ label: string; open: keyof ScalperProgressionRow; close: keyof ScalperProgressionRow }> = [
  { label: "Today", open: "todayOpen", close: "todayClose" },
  { label: "Previous day", open: "previousDayOpen", close: "previousDayClose" },
  { label: "Current week", open: "currentWeekOpen", close: "currentWeekClose" },
  { label: "Last week", open: "previousWeekOpen", close: "previousWeekClose" },
  { label: "Two weeks ago", open: "twoWeeksAgoOpen", close: "twoWeeksAgoClose" },
  { label: "This month", open: "currentMonthOpen", close: "currentMonthClose" },
  { label: "Previous month", open: "previousMonthOpen", close: "previousMonthClose" },
  { label: "Two months ago", open: "twoMonthsAgoOpen", close: "twoMonthsAgoClose" },
];

function value(row: ScalperProgressionRow, key: keyof ScalperProgressionRow): string {
  const raw = row[key];
  return typeof raw === "number" && Number.isFinite(raw) ? fmtPrice(raw) : "—";
}

function conditionText(state: ScalperConditionState): string {
  if (state === "PASS") return "✓ Pass";
  if (state === "FAIL") return "✕ Fail";
  return "— Missing";
}

function conditionClass(state: ScalperConditionState): string {
  return state === "PASS" ? styles.pass : state === "FAIL" ? styles.fail : styles.missing;
}

export function ScalperDashboardPage() {
  const query = useScalperProgression();
  const [search, setSearch] = useState("");
  const [sector, setSector] = useState("ALL");
  const [scoreFilter, setScoreFilter] = useState("ALL");
  const [conditionFilters, setConditionFilters] = useState<Record<ScalperConditionCode, StateFilter>>(() => ({
    M2_RED: "ALL", M1_GREEN: "ALL", D0_OPEN_ABOVE_W0_OPEN: "ALL", D0_OPEN_ABOVE_W1_OPEN: "ALL", D0_OPEN_ABOVE_D1_OPEN: "ALL",
  }));

  const rows = query.data?.rows ?? EMPTY_ROWS;
  const sectors = useMemo(() => Array.from(new Set(rows.map((row) => row.sector).filter((item): item is string => Boolean(item)))).sort(), [rows]);
  const filteredRows = useMemo(() => {
    const needle = search.trim().toUpperCase();
    return rows.filter((row) => {
      const states = scalperConditionStates(row);
      const score = scalperScore(row);
      if (needle && !`${row.symbol} ${row.companyName ?? ""} ${row.sector ?? ""}`.toUpperCase().includes(needle)) return false;
      if (sector !== "ALL" && row.sector !== sector) return false;
      if (scoreFilter === "ALL_PASS" && !(score.passed === 5 && score.available === 5)) return false;
      if (scoreFilter === "FOUR_PLUS" && score.passed < 4) return false;
      if (scoreFilter === "INCOMPLETE" && score.available === 5) return false;
      return SCALPER_CONDITION_CODES.every((code) => conditionFilters[code] === "ALL" || states[code] === conditionFilters[code]);
    }).sort((a, b) => scalperScore(b).passed - scalperScore(a).passed || a.symbol.localeCompare(b.symbol));
  }, [conditionFilters, rows, scoreFilter, search, sector]);

  const counts = useMemo(() => rows.reduce((total, row) => {
    const score = scalperScore(row);
    if (score.passed === 5 && score.available === 5) total.allPass += 1;
    if (score.passed >= 4) total.fourPlus += 1;
    if (score.available < 5) total.incomplete += 1;
    return total;
  }, { allPass: 0, fourPlus: 0, incomplete: 0 }), [rows]);

  const clearFilters = () => {
    setSearch(""); setSector("ALL"); setScoreFilter("ALL");
    setConditionFilters({ M2_RED: "ALL", M1_GREEN: "ALL", D0_OPEN_ABOVE_W0_OPEN: "ALL", D0_OPEN_ABOVE_W1_OPEN: "ALL", D0_OPEN_ABOVE_D1_OPEN: "ALL" });
  };

  return <main className={styles.page} data-testid="scalper-dashboard">
    <section className={styles.hero}>
      <div>
        <span className={styles.eyebrow}>STRATEGY · CURRENT-MONTH FILTER</span>
        <h1>Scalper Dashboard</h1>
        <p>All recorded current NSE stock F&amp;O symbols with daily, weekly and monthly open/close anchors. Read-only screening evidence; missing source history remains unavailable.</p>
      </div>
      <nav className={styles.heroLinks} aria-label="Related strategy views">
        <Link to="/strategy/monthly?entryMethod=MONTHLY_OPEN">Monthly Open</Link>
        <Link to="/strategy/monthly?compare=close-open">Compare strategies</Link>
        <a className={styles.download} href={getScalperProgressionExcelUrl()} download data-testid="scalper-dashboard-excel">Download all Excel</a>
      </nav>
    </section>

    <section className={styles.summary} aria-label="Screener summary">
      <div className={styles.metric}><span className={styles.metricLabel}>Universe stocks</span><span className={styles.metricValue}>{rows.length}</span></div>
      <div className={styles.metric}><span className={styles.metricLabel}>Visible after filters</span><span className={styles.metricValue} data-testid="scalper-visible-count">{filteredRows.length}</span></div>
      <div className={styles.metric}><span className={styles.metricLabel}>All 5 conditions pass</span><span className={styles.metricValue}>{counts.allPass}</span></div>
      <div className={styles.metric}><span className={styles.metricLabel}>At least 4 pass</span><span className={styles.metricValue}>{counts.fourPlus}</span></div>
      <div className={styles.metric}><span className={styles.metricLabel}>Incomplete condition data</span><span className={styles.metricValue}>{counts.incomplete}</span></div>
    </section>

    <section className={styles.filters} aria-label="Scalper filters">
      <label>Find stock<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Symbol, company or sector" data-testid="scalper-search" /></label>
      <label>Sector<select value={sector} onChange={(event) => setSector(event.target.value)}><option value="ALL">All sectors</option>{sectors.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>Score<select value={scoreFilter} onChange={(event) => setScoreFilter(event.target.value)} data-testid="scalper-score-filter"><option value="ALL">Any score</option><option value="ALL_PASS">All 5 pass</option><option value="FOUR_PLUS">At least 4 pass</option><option value="INCOMPLETE">Incomplete data</option></select></label>
      <button className={styles.clear} type="button" onClick={clearFilters}>Clear filters</button>
      <div className={styles.conditionFilters}>
        {SCALPER_CONDITION_CODES.map((code) => <label key={code}>{scalperConditionLabel(code)}<select value={conditionFilters[code]} onChange={(event) => setConditionFilters((current) => ({ ...current, [code]: event.target.value as StateFilter }))}><option value="ALL">Any state</option><option value="PASS">Pass</option><option value="FAIL">Fail</option><option value="UNAVAILABLE">Missing</option></select></label>)}
      </div>
    </section>

    <section className={styles.tableCard} aria-label="Current month scalper screener">
      <div className={styles.tableMeta}>
        <span><strong>Session:</strong> {query.data?.sessionDate ?? "—"}</span>
        <span><strong>Scope:</strong> Current NSE stock F&amp;O universe</span>
        <span><strong>Generated:</strong> {formatDateIST(query.data?.generatedAt, { includeTime: true })}</span>
        <span><strong>Basis:</strong> {query.data?.basis ?? "—"}</span>
      </div>
      {query.isLoading ? <div className={styles.state}>Loading current-month anchors…</div> : null}
      {query.isError ? <div className={`${styles.state} ${styles.error}`}>Unable to load the screener. Source values were not replaced with defaults.</div> : null}
      {!query.isLoading && !query.isError ? <div className={styles.tableViewport} data-testid="scalper-table-scroll">
        <table className={styles.table} data-testid="scalper-table">
          <thead>
            <tr><th className={styles.identity} rowSpan={2}>Stock</th><th colSpan={2}>Current</th>{PERIODS.map((period) => <th className={styles.periodHead} colSpan={2} key={period.label}>{period.label}</th>)}<th colSpan={6}>Monthly Open v3 screening conditions</th><th colSpan={2}>Evidence times</th></tr>
            <tr><th>Price</th><th>Sector</th>{PERIODS.map((period) => <Fragment key={period.label}><th className={styles.periodHead}>Open</th><th>Close / as-of</th></Fragment>)}<th>Score</th>{SCALPER_CONDITION_CODES.map((code) => <th className={styles.condition} key={code}>{scalperConditionLabel(code)}</th>)}<th>History through</th><th>Price observed</th></tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => {
              const states = scalperConditionStates(row); const score = scalperScore(row);
              return <tr key={row.symbol}>
                <td className={styles.identity}><Link className={styles.symbol} to={`/analytics/stock/${encodeURIComponent(row.symbol)}`}>{row.symbol}</Link>{row.companyName ? <span className={styles.company} title={row.companyName}>{row.companyName}</span> : null}</td>
                <td>{row.currentValue == null ? "—" : fmtPrice(row.currentValue)}</td><td>{row.sector || "—"}</td>
                {PERIODS.map((period) => <Fragment key={`${row.symbol}-${period.label}`}><td className={styles.periodHead}>{value(row, period.open)}</td><td>{value(row, period.close)}</td></Fragment>)}
                <td className={styles.score}>{score.passed}/{score.available}</td>
                {SCALPER_CONDITION_CODES.map((code) => <td className={`${styles.condition} ${conditionClass(states[code])}`} key={`${row.symbol}-${code}`}>{conditionText(states[code])}</td>)}
                <td>{row.historyThrough ? formatDateIST(row.historyThrough) : "—"}</td><td>{row.observedAt ? formatDateIST(row.observedAt, { includeTime: true }) : "—"}</td>
              </tr>;
            })}
          </tbody>
        </table>
        {filteredRows.length === 0 ? <div className={styles.state}>No stocks match the selected filters.</div> : null}
      </div> : null}
    </section>
  </main>;
}
