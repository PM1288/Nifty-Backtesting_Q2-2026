import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { EChartSurface } from "../components/visual/EChartSurface";
import { StockIdentity } from "../components/stocks/StockProfileControls";
import {
  fetchTrendlyneSummaryDashboard,
  type TrendlyneSummaryDashboard,
} from "../lib/api";
import { useProfileIndex } from "../lib/stockProfiles";
import styles from "./TrendlyneSummaryPage.module.css";

const n = (value: unknown): number | null =>
  value == null || value === "" || !Number.isFinite(Number(value))
    ? null
    : Number(value);
const pct = (value: unknown) =>
  n(value) == null
    ? "—"
    : `${Number(value) >= 0 ? "+" : ""}${Number(value).toFixed(2)}%`;
const price = (value: unknown) =>
  n(value) == null
    ? "—"
    : new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2,
      }).format(Number(value));
const date = (value: unknown) => (value ? String(value).slice(0, 10) : "—");

function download(rows: any[]) {
  const fields = [
    "report_id",
    "report_date",
    "symbol",
    "stock_name",
    "research_house",
    "recommendation",
    "recommended_price",
    "target_price",
    "entry_session_date",
    "target_hit",
    "target_hit_date",
    "d5_status",
    "d5_end_return_pct",
    "d5_max_profit_pct",
    "d5_max_drawdown_pct",
    "d30_status",
    "d30_end_return_pct",
    "d30_max_profit_pct",
    "d30_max_drawdown_pct",
    "current_return_pct",
    "evaluation_status",
    "data_quality_status",
  ];
  const q = (value: unknown) =>
    `"${String(value ?? "").replaceAll('"', '""')}"`;
  const blob = new Blob(
    [
      [
        fields.join(","),
        ...rows.map((row) => fields.map((field) => q(row[field])).join(",")),
      ].join("\n"),
    ],
    { type: "text/csv;charset=utf-8" },
  );
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "trendlyne-summary-six-months.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

function Kpi({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className={styles.kpi}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function Inspector({
  row,
  onClose,
  profile,
}: {
  row: any;
  onClose: () => void;
  profile: any;
}) {
  const reasons = Array.isArray(row.data_quality_reasons)
    ? row.data_quality_reasons
    : [];
  return (
    <aside
      className={styles.inspector}
      aria-label={`${row.symbol} Trendlyne recommendation`}
    >
      <header>
        <div>
          <StockIdentity symbol={row.symbol} profile={profile} />
          <h2>{row.stock_name}</h2>
          <p>
            {row.research_house} · {row.recommendation} ·{" "}
            {date(row.report_date)}
          </p>
        </div>
        <button aria-label="Close inspector" onClick={onClose}>
          ×
        </button>
      </header>
      <section className={styles.inspectorGrid}>
        <Kpi
          label="Recommendation price"
          value={price(row.entry_price)}
          detail={row.entry_price_source ?? "Unavailable"}
        />
        <Kpi
          label="Target"
          value={price(row.target_price)}
          detail={
            row.target_hit
              ? `Hit ${date(row.target_hit_date)}`
              : row.target_eligible
                ? "Not hit"
                : "Not eligible"
          }
        />
        <Kpi
          label="5D reward / pain"
          value={`${pct(row.d5_max_profit_pct)} / ${pct(row.d5_max_drawdown_pct)}`}
          detail={`${row.d5_sessions}/5 sessions`}
        />
        <Kpi
          label="30D reward / pain"
          value={`${pct(row.d30_max_profit_pct)} / ${pct(row.d30_max_drawdown_pct)}`}
          detail={`${row.d30_sessions}/30 sessions`}
        />
      </section>
      <section>
        <h3>Recommendation chronology</h3>
        <dl>
          <div>
            <dt>Report opened</dt>
            <dd>{date(row.report_date)}</dd>
          </div>
          <div>
            <dt>First observable session</dt>
            <dd>{date(row.entry_session_date)}</dd>
          </div>
          <div>
            <dt>Target hit</dt>
            <dd>
              {row.target_hit
                ? `${date(row.target_hit_date)} · session ${row.target_hit_session}`
                : "No"}
            </dd>
          </div>
          <div>
            <dt>Latest mark</dt>
            <dd>
              {price(row.latest_price)} · {date(row.latest_session_date)}
            </dd>
          </div>
        </dl>
      </section>
      <section>
        <h3>Returns from recommendation price</h3>
        <dl>
          <div>
            <dt>5D close</dt>
            <dd>{pct(row.d5_end_return_pct)}</dd>
          </div>
          <div>
            <dt>30D close</dt>
            <dd>{pct(row.d30_end_return_pct)}</dd>
          </div>
          <div>
            <dt>Current</dt>
            <dd>{pct(row.current_return_pct)}</dd>
          </div>
          <div>
            <dt>State</dt>
            <dd>{String(row.evaluation_status).replaceAll("_", " ")}</dd>
          </div>
        </dl>
      </section>
      <section>
        <h3>Data quality</h3>
        <p>
          <b>{String(row.data_quality_status).replaceAll("_", " ")}</b>
        </p>
        {reasons.length ? (
          <ul>
            {reasons.map((reason: string) => (
              <li key={reason}>{reason.replaceAll("_", " ")}</li>
            ))}
          </ul>
        ) : (
          <p>No recorded issue.</p>
        )}
      </section>
      <footer>
        <Link
          to={`/analytics/stock/${encodeURIComponent(row.symbol)}?source=trendlyne&reportId=${encodeURIComponent(row.report_id)}&asOf=${date(row.report_date)}`}
        >
          Open Stock 360
        </Link>
        {row.report_url ? (
          <a href={row.report_url} target="_blank" rel="noreferrer">
            Open source report
          </a>
        ) : null}
      </footer>
    </aside>
  );
}

export function TrendlyneSummaryPage() {
  const profiles = useProfileIndex();
  const [data, setData] = useState<TrendlyneSummaryDashboard | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<any>(null);
  const [recommendation, setRecommendation] = useState("ACTIONABLE");
  const [house, setHouse] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [quality, setQuality] = useState("ALL");
  const [query, setQuery] = useState("");
  useEffect(() => {
    let active = true;
    fetchTrendlyneSummaryDashboard()
      .then((value) => active && setData(value))
      .catch(
        (reason) =>
          active &&
          setError(reason instanceof Error ? reason.message : String(reason)),
      );
    return () => {
      active = false;
    };
  }, []);
  const houses = useMemo(
    () =>
      Array.from(
        new Set((data?.rows ?? []).map((row) => String(row.research_house))),
      ).sort(),
    [data],
  );
  const rows = useMemo(
    () =>
      (data?.rows ?? []).filter(
        (row) =>
          (recommendation === "ALL" ||
            (recommendation === "ACTIONABLE"
              ? ["LONG", "SHORT"].includes(String(row.direction))
              : row.recommendation === recommendation)) &&
          (house === "ALL" || row.research_house === house) &&
          (status === "ALL" || row.evaluation_status === status) &&
          (quality === "ALL" || row.data_quality_status === quality) &&
          (!query ||
            `${row.symbol} ${row.stock_name}`
              .toLowerCase()
              .includes(query.toLowerCase())),
      ),
    [data, recommendation, house, status, quality, query],
  );
  const topHouses = useMemo(
    () =>
      (data?.houseSummary ?? [])
        .filter((row) => Number(row.resolved_targets) >= 10)
        .slice(0, 15),
    [data],
  );
  const houseChart = useMemo(
    () => ({
      grid: { left: 135, right: 30, top: 20, bottom: 35 },
      tooltip: { trigger: "axis" },
      xAxis: { type: "value", name: "Resolved target hit rate %", min: 0 },
      yAxis: {
        type: "category",
        inverse: true,
        data: topHouses.map((row) => row.research_house),
      },
      series: [
        {
          type: "bar",
          data: topHouses.map((row) => Number(row.target_hit_rate_pct ?? 0)),
          itemStyle: { color: "#4f46e5", borderRadius: [0, 5, 5, 0] },
        },
      ],
    }),
    [topHouses],
  );
  const monthlyChart = useMemo(
    () => ({
      grid: { left: 52, right: 28, top: 32, bottom: 45 },
      tooltip: { trigger: "axis" },
      legend: { data: ["5D average", "30D average"] },
      xAxis: {
        type: "category",
        data: (data?.monthlySummary ?? []).map((row) =>
          date(row.month).slice(0, 7),
        ),
      },
      yAxis: { type: "value", name: "% return" },
      series: [
        {
          name: "5D average",
          type: "line",
          smooth: true,
          data: (data?.monthlySummary ?? []).map((row) =>
            n(row.average_d5_return_pct),
          ),
        },
        {
          name: "30D average",
          type: "line",
          smooth: true,
          data: (data?.monthlySummary ?? []).map((row) =>
            n(row.average_d30_return_pct),
          ),
        },
      ],
    }),
    [data],
  );
  const summary = data?.summary ?? {};
  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div>
          <span>THIRD-PARTY RESEARCH EVIDENCE · TRAILING SIX MONTHS</span>
          <h1>Trendlyne Summary</h1>
          <p>
            Track when recommendations opened, who issued them, target
            chronology and direction-normalised 5D and 30D reward versus pain.
          </p>
        </div>
        <div>
          <b>{data?.source ?? "Trendlyne"}</b>
          <small>Refreshed {date(summary.refreshed_at)}</small>
        </div>
      </header>
      {error ? (
        <div className={styles.error}>
          <b>Trendlyne analysis unavailable</b>
          <span>{error}</span>
        </div>
      ) : !data ? (
        <div className={styles.loading}>
          Loading Trendlyne recommendation evidence…
        </div>
      ) : (
        <>
          <div className={styles.filters}>
            <strong>
              {rows.length} visible / {data.rows.length} reports
            </strong>
            <label>
              Recommendation
              <select
                value={recommendation}
                onChange={(e) => setRecommendation(e.target.value)}
              >
                <option value="ACTIONABLE">Buy, Accumulate & Sell</option>
                <option value="ALL">All recommendations</option>
                {["Buy", "Accumulate", "Sell", "Hold", "Neutral"].map(
                  (value) => (
                    <option key={value}>{value}</option>
                  ),
                )}
              </select>
            </label>
            <label>
              Research house
              <select value={house} onChange={(e) => setHouse(e.target.value)}>
                <option value="ALL">All houses</option>
                {houses.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              State
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="ALL">All states</option>
                <option value="TARGET_HIT">Target hit</option>
                <option value="OPEN_DEVELOPING">Open · developing</option>
                <option value="OPEN_TARGET_NOT_HIT_30D_COMPLETE">
                  30D complete · target open
                </option>
                <option value="DATA_INCOMPLETE">Incomplete</option>
              </select>
            </label>
            <label>
              Data quality
              <select
                value={quality}
                onChange={(e) => setQuality(e.target.value)}
              >
                <option value="ALL">All</option>
                <option value="VALID">Valid</option>
                <option value="PARTIAL">Partial</option>
                <option value="INVALID_TARGET_DIRECTION">
                  Invalid target direction
                </option>
                <option value="INCOMPLETE">Incomplete</option>
              </select>
            </label>
            <label>
              Stock
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Symbol or company"
              />
            </label>
            <button onClick={() => download(rows)}>Download CSV</button>
          </div>
          <section className={styles.kpis}>
            <Kpi
              label="Directional recommendations"
              value={String(summary.actionable ?? 0)}
              detail={`${summary.reports ?? 0} total reports`}
            />
            <Kpi
              label="Resolved target hit rate"
              value={
                summary.target_hit_rate_pct == null
                  ? "—"
                  : `${Number(summary.target_hit_rate_pct).toFixed(2)}%`
              }
              detail={`${summary.target_hits ?? 0} of ${summary.resolved_targets ?? 0}`}
            />
            <Kpi
              label="Average mature 5D / 30D"
              value={`${pct(summary.average_d5_return_pct)} / ${pct(summary.average_d30_return_pct)}`}
              detail="Direction normalised"
            />
            <Kpi
              label="30D reward / pain"
              value={`${pct(summary.average_d30_max_profit_pct)} / ${pct(summary.average_d30_max_drawdown_pct)}`}
              detail={`${summary.developing ?? 0} developing · ${summary.data_issues ?? 0} issues`}
            />
          </section>
          <section className={styles.charts}>
            <article>
              <header>
                <h2>
                  Which research houses have the best resolved target record?
                </h2>
                <small>
                  Minimum 10 resolved targets; sample size remains in the table
                  below.
                </small>
              </header>
              <EChartSurface
                className={styles.chart}
                ariaLabel="Research house target hit rates"
                option={houseChart as any}
              />
            </article>
            <article>
              <header>
                <h2>How did recommendation cohorts perform by month?</h2>
                <small>
                  Average mature direction-normalised closing return.
                </small>
              </header>
              <EChartSurface
                className={styles.chart}
                ariaLabel="Monthly five and thirty session recommendation returns"
                option={monthlyChart as any}
              />
            </article>
          </section>
          <section className={styles.panel}>
            <header>
              <div>
                <span>RESEARCH-HOUSE TRACK RECORD</span>
                <h2>Resolved targets and mature return evidence</h2>
              </div>
              <small>Rank only with denominators visible.</small>
            </header>
            <div className={styles.tableViewport} tabIndex={0} aria-label="Scrollable research-house evidence table">
              <table>
                <thead>
                  <tr>
                    <th>Research house</th>
                    <th>Recommendations</th>
                    <th>Resolved</th>
                    <th>Targets hit</th>
                    <th>Hit rate</th>
                    <th>Avg 5D</th>
                    <th>Avg 30D</th>
                    <th>30D reward</th>
                    <th>30D pain</th>
                    <th>Issues</th>
                  </tr>
                </thead>
                <tbody>
                  {data.houseSummary.map((row) => (
                    <tr key={String(row.research_house)}>
                      <td>
                        <b>{row.research_house}</b>
                      </td>
                      <td>{row.actionable}</td>
                      <td>{row.resolved_targets}</td>
                      <td>{row.target_hits}</td>
                      <td>{pct(row.target_hit_rate_pct)}</td>
                      <td>{pct(row.average_d5_return_pct)}</td>
                      <td>{pct(row.average_d30_return_pct)}</td>
                      <td className={styles.good}>
                        {pct(row.average_d30_max_profit_pct)}
                      </td>
                      <td className={styles.bad}>
                        {pct(row.average_d30_max_drawdown_pct)}
                      </td>
                      <td>{row.data_issues}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className={styles.panel}>
            <header>
              <div>
                <span>STOCK SUMMARY</span>
                <h2>Recommendation evidence by stock</h2>
              </div>
              <small>{data.stockSummary.length} symbols</small>
            </header>
            <div className={styles.tableViewport} tabIndex={0} aria-label="Scrollable stock recommendation summary table">
              <table>
                <thead>
                  <tr>
                    <th>Stock</th>
                    <th>Reports</th>
                    <th>Directional</th>
                    <th>Targets hit</th>
                    <th>Avg 5D</th>
                    <th>Avg 30D</th>
                    <th>Best 30D reward</th>
                    <th>Worst 30D pain</th>
                    <th>Latest report</th>
                  </tr>
                </thead>
                <tbody>
                  {data.stockSummary.map((row) => (
                    <tr key={String(row.symbol)}>
                      <td>
                        <StockIdentity
                          symbol={String(row.symbol)}
                          profile={profiles.bySymbol.get(String(row.symbol))}
                        />
                        <small>{row.stock_name}</small>
                      </td>
                      <td>{row.reports}</td>
                      <td>{row.actionable}</td>
                      <td>{row.target_hits}</td>
                      <td>{pct(row.average_d5_return_pct)}</td>
                      <td>{pct(row.average_d30_return_pct)}</td>
                      <td className={styles.good}>
                        {pct(row.best_30d_max_profit_pct)}
                      </td>
                      <td className={styles.bad}>
                        {pct(row.worst_30d_max_drawdown_pct)}
                      </td>
                      <td>{date(row.latest_report_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className={styles.panel}>
            <header>
              <div>
                <span>COMPLETE SIX-MONTH LEDGER</span>
                <h2>Every directional recommendation and its evidence path</h2>
              </div>
              <small>Click a row for chronology and provenance.</small>
            </header>
            <div className={styles.tableViewport} tabIndex={0} aria-label="Scrollable six-month recommendation ledger">
              <table>
                <thead>
                  <tr>
                    <th>Stock</th>
                    <th>Opened</th>
                    <th>Research house</th>
                    <th>Reco</th>
                    <th>Entry</th>
                    <th>Target</th>
                    <th>Target state</th>
                    <th>5D end</th>
                    <th>5D max</th>
                    <th>5D drawdown</th>
                    <th>30D end</th>
                    <th>30D max</th>
                    <th>30D drawdown</th>
                    <th>Current</th>
                    <th>Quality</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={String(row.report_id)}
                      tabIndex={0}
                      onClick={() => setSelected(row)}
                      onKeyDown={(event) =>
                        event.key === "Enter" && setSelected(row)
                      }
                    >
                      <td>
                        <StockIdentity
                          symbol={String(row.symbol)}
                          profile={profiles.bySymbol.get(String(row.symbol))}
                          compact
                        />
                        <small>{row.stock_name}</small>
                      </td>
                      <td>{date(row.report_date)}</td>
                      <td>{row.research_house}</td>
                      <td>
                        <span className={styles.badge}>
                          {row.recommendation}
                        </span>
                      </td>
                      <td>{price(row.entry_price)}</td>
                      <td>{price(row.target_price)}</td>
                      <td>
                        <b className={row.target_hit ? styles.good : ""}>
                          {row.target_hit
                            ? `Hit ${date(row.target_hit_date)}`
                            : row.target_eligible
                              ? "Open"
                              : "Not eligible"}
                        </b>
                      </td>
                      <td>
                        {pct(row.d5_end_return_pct)}
                        <small>{row.d5_sessions}/5</small>
                      </td>
                      <td className={styles.good}>
                        {pct(row.d5_max_profit_pct)}
                      </td>
                      <td className={styles.bad}>
                        {pct(row.d5_max_drawdown_pct)}
                      </td>
                      <td>
                        {pct(row.d30_end_return_pct)}
                        <small>{row.d30_sessions}/30</small>
                      </td>
                      <td className={styles.good}>
                        {pct(row.d30_max_profit_pct)}
                      </td>
                      <td className={styles.bad}>
                        {pct(row.d30_max_drawdown_pct)}
                      </td>
                      <td>{pct(row.current_return_pct)}</td>
                      <td>
                        <span className={styles.state}>
                          {String(row.data_quality_status).replaceAll("_", " ")}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className={styles.method}>
            <h2>Methodology and limitations</h2>
            {data.warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
            <details>
              <summary>Calculation rules</summary>
              {Object.entries(data.methodology).map(([key, value]) => (
                <p key={key}>
                  <b>{key.replaceAll("_", " ")}:</b> {value}
                </p>
              ))}
            </details>
          </section>
        </>
      )}
      {selected ? (
        <Inspector
          row={selected}
          onClose={() => setSelected(null)}
          profile={profiles.bySymbol.get(String(selected.symbol))}
        />
      ) : null}
    </main>
  );
}
