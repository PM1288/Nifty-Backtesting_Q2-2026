import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getJson } from "../lib/api";
import {
  predictorModels,
  predictorLeaderboard,
  studyLeaderboard,
  type PredictorData,
  type PredictorRow,
  type StudyRow,
} from "../lib/predictor";
import styles from "./PredictorPage.module.css";
const num = (v: number | null | undefined, d = 2) =>
  v == null || !Number.isFinite(v)
    ? "—"
    : v.toLocaleString("en-IN", {
        maximumFractionDigits: d,
        minimumFractionDigits: d,
      });
const time = (v: string) =>
  new Date(v).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
function save(name: string, body: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function ErrorChart({ rows }: { rows: StudyRow[] }) {
  const days = [...new Set(rows.map((r) => r.day))].sort(),
    maximum = Math.max(0.1, ...rows.map((r) => Math.abs(r.error)));
  if (!days.length) return null;
  return (
    <figure className={styles.chart}>
      <figcaption>Closing-return error by session · lower is better</figcaption>
      <svg
        viewBox="0 0 1000 160"
        role="img"
        aria-label="Absolute out-of-sample errors for three models over chronological daily sessions"
      >
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line
              x1="45"
              x2="985"
              y1={135 - t * 115}
              y2={135 - t * 115}
              stroke="#d8e0e9"
            />
            <text x="0" y={139 - t * 115} fontSize="12" fill="currentColor">
              {num(t * maximum, 1)}
            </text>
          </g>
        ))}
        {Object.keys(predictorModels).map((model, i) => (
          <polyline
            key={model}
            fill="none"
            stroke={["#78889a", "#2876dd", "#a35cc9"][i]}
            strokeWidth="2"
            points={days
              .map((day, j) => {
                const r = rows.find((r) => r.day === day && r.model === model);
                return `${45 + (j * 940) / Math.max(1, days.length - 1)},${135 - ((r ? Math.abs(r.error) : 0) / maximum) * 115}`;
              })
              .join(" ")}
          />
        ))}
        <text x="45" y="158" fontSize="12" fill="currentColor">
          {days[0]}
        </text>
        <text x="895" y="158" fontSize="12" fill="currentColor">
          {days.at(-1)}
        </text>
      </svg>
      <div className={styles.legend}>
        <span>Grey: benchmark</span>
        <span>Blue: regression</span>
        <span>Purple: similar days</span>
        <span>Y: percentage-point error</span>
      </div>
    </figure>
  );
}
function Range({ row }: { row: PredictorRow }) {
  const p = row.payload,
    min = Math.min(
      p.low,
      p.reference,
      p.predicted,
      row.outcome?.actual ?? Infinity,
    ),
    max = Math.max(
      p.high,
      p.reference,
      p.predicted,
      row.outcome?.actual ?? -Infinity,
    ),
    x = (v: number) => 5 + (90 * (v - min)) / (max - min || 1);
  return (
    <div
      className={styles.range}
      role="img"
      aria-label={`Daily-error range ${num(p.low)} to ${num(p.high)}, estimate ${num(p.predicted)}, morning reference ${num(p.reference)}`}
    >
      <div
        style={{ left: `${x(p.low)}%`, width: `${x(p.high) - x(p.low)}%` }}
      />
      <i style={{ left: `${x(p.reference)}%` }} title="Morning reference" />
      <b style={{ left: `${x(p.predicted)}%` }} title="Estimate" />
      {row.outcome && (
        <em
          style={{ left: `${x(row.outcome.actual)}%` }}
          title="Actual close"
        />
      )}
    </div>
  );
}
export function PredictorPage() {
  const [day, setDay] = useState("");
  const [tab, setTab] = useState("Forecasts");
  const [symbol, setSymbol] = useState("ALL");
  const [studySymbol, setStudySymbol] = useState("NIFTY");
  const [regime, setRegime] = useState("ALL");
  const [detail, setDetail] = useState<unknown>(null);
  const [detailError, setDetailError] = useState("");
  const query = useQuery({
    queryKey: ["predictor", day],
    queryFn: ({ signal }) =>
      getJson<PredictorData>(
        `/v1/predictor${day ? `?day=${day}` : ""}`,
        signal,
      ),
    refetchInterval: 60000,
  });
  const data = query.data,
    forecasts = data?.forecasts ?? [],
    filtered = useMemo(
      () => forecasts.filter((r) => symbol === "ALL" || r.symbol === symbol),
      [forecasts, symbol],
    ),
    leaders = useMemo(() => predictorLeaderboard(filtered), [filtered]);
  const study = data?.studies.find((s) => s.symbol === studySymbol),
    studyRows = study?.payload.rows ?? [],
    studySelected = studyRows.filter(
      (r) => regime === "ALL" || r.condition === regime,
    ),
    historical = studyLeaderboard(studySelected),
    completed = forecasts.filter((r) => r.outcome).length;
  const stale =
    !!data?.status &&
    Date.now() - Date.parse(data.status.updated_at) > 12 * 60000;
  const csv = () => {
    const cells = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
    const rows =
      tab === "Historical lab"
        ? [
            [
              "symbol",
              "date",
              "model",
              "condition",
              "actual_open_close_pct",
              "predicted_open_close_pct",
              "error_pp",
            ],
            ...studySelected.map((r) => [
              studySymbol,
              r.day,
              r.model,
              r.condition,
              r.actual,
              r.predicted,
              r.error,
            ]),
          ]
        : [
            [
              "day",
              "symbol",
              "model",
              "published_at",
              "source_at",
              "reference",
              "predicted_close",
              "band_low",
              "band_high",
              "estimated_probability",
              "actual_close",
              "absolute_error_pct",
              "condition",
            ],
            ...filtered.map((r) => [
              r.day,
              r.symbol,
              r.model,
              r.published_at,
              r.source_at,
              r.payload.reference,
              r.payload.predicted,
              r.payload.low,
              r.payload.high,
              r.payload.probabilityAboveReference,
              r.outcome?.actual,
              r.outcome?.absoluteErrorPct,
              r.payload.condition,
            ]),
          ];
    save(
      `predictor-${tab === "Historical lab" ? "retrospective" : "forward"}-${data?.selectedDay}.csv`,
      rows.map((r) => r.map(cells).join(",")).join("\r\n"),
      "text/csv",
    );
  };
  return (
    <main className={styles.page} data-testid="predictor-dashboard">
      <header className={styles.header}>
        <div>
          <small>MEASURE FIRST · TRUST ONLY WITH EVIDENCE</small>
          <h1>Predictor</h1>
          <p>
            NIFTY + OIIS stocks passing Month, Week and Day gates. Morning
            outlook → closing result.
          </p>
        </div>
        <div className={styles.actions}>
          <button
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
          >
            Refresh
          </button>
          <button
            disabled={!data}
            onClick={() =>
              save(
                `predictor-${data?.selectedDay}.json`,
                JSON.stringify(data, null, 2),
              )
            }
          >
            Export JSON
          </button>
          <button disabled={!data} onClick={csv}>
            Export CSV
          </button>
          <Link to="/paper-trading?tab=analyzer">Paper Analyzer</Link>
        </div>
      </header>
      {query.isError && (
        <p role="alert">
          Predictor refresh failed.{" "}
          {data
            ? "Previous evidence remains visible; it is not a fresh forecast."
            : "Forecasts are unavailable."}
        </p>
      )}
      {tab === "Historical lab" && historical[0]?.n > 0 && (
        <p className={styles.notice}>
          <b>
            {historical[0].model === "no-change"
              ? "No demonstrated improvement in closing-price accuracy."
              : "Historical improvement only—not a validated live edge."}
          </b>{" "}
          A high direction-hit percentage alone does not establish
          profitability. Model rankings can change with the period and market
          conditions.
        </p>
      )}
      {!data ? (
        <p role="status">
          {query.isPending
            ? "Loading saved forecasts and model evidence…"
            : "No evidence available."}
        </p>
      ) : (
        <>
          <div className={styles.notice}>
            <b>Experimental · no orders</b> Estimates can be wrong. Ranges are
            historical daily-error bands, not guaranteed support/resistance or
            calibrated intraday probabilities. Missing inputs never become
            invented targets.
          </div>
          <div className={styles.kpis}>
            <article>
              <span>Forecast session · IST</span>
              <strong>{data.selectedDay}</strong>
              <small>Publication 09:30–10:00 on regular sessions</small>
            </article>
            <article>
              <span>Forward forecasts</span>
              <strong>
                {new Set(forecasts.map((r) => r.symbol)).size} instruments
              </strong>
              <small>
                {forecasts.length} forecasts · {completed} evaluated
              </small>
            </article>
            <article>
              <span>Next recorded session</span>
              <strong>{data.status?.payload.nextSession?.day ?? "—"}</strong>
              <small>Eligibility checked afresh that morning</small>
            </article>
            <article>
              <span>Automation health</span>
              <strong
                className={stale || !data.status ? styles.bad : styles.good}
              >
                {!data.status
                  ? "Not yet run"
                  : stale
                    ? "Heartbeat delayed"
                    : "Worker reporting"}
              </strong>
              <small>
                {data.status
                  ? `${time(data.status.updated_at)} IST · ${data.status.payload.state.replaceAll("_", " ").toLowerCase()}`
                  : "Awaiting worker"}
              </small>
            </article>
          </div>
          <nav className={styles.tabs} aria-label="Predictor views">
            {[
              "Forecasts",
              "EOD scorecard",
              "Historical lab",
              "Models & eligibility",
            ].map((name) => (
              <button
                key={name}
                aria-pressed={tab === name}
                onClick={() => setTab(name)}
              >
                {name}
              </button>
            ))}
          </nav>
          <div className={styles.actions}>
            <label>
              Session{" "}
              <select
                aria-label="Forecast session"
                value={day}
                onChange={(e) => {
                  setDay(e.target.value);
                  setSymbol("ALL");
                }}
              >
                <option value="">Today</option>
                {data.dates.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </label>
            {tab !== "Historical lab" && (
              <label>
                Instrument{" "}
                <select
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                >
                  <option value="ALL">All eligible instruments</option>
                  {[...new Set(forecasts.map((r) => r.symbol))].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {tab === "Forecasts" && (
            <section>
              <h2>Possible closing levels</h2>
              <p className={styles.caption}>
                Solid mark: estimate · thin mark: saved morning price · green
                mark: actual close. One immutable forecast per
                model/stock/session.
              </p>
              {!filtered.length ? (
                <div className={styles.empty}>
                  <h3>No forward forecasts for this session yet</h3>
                  <p>
                    The worker captures fresh morning bars between 09:30 and
                    10:00 IST. NIFTY is always considered; stocks must be
                    selected/recommended by OIIS and pass the matching bullish
                    or bearish MWD route. Late or missing inputs are skipped,
                    not backdated.
                  </p>
                  <button onClick={() => setTab("Historical lab")}>
                    View NIFTY historical model tests
                  </button>
                </div>
              ) : (
                <div className={styles.table}>
                  <table>
                    <thead>
                      <tr>
                        {[
                          "Instrument / route",
                          "Model",
                          "Morning reference",
                          "Estimated close",
                          "Daily error band",
                          "Estimated P(close > reference)",
                          "Conditions at forecast",
                          "Result / evidence",
                        ].map((t) => (
                          <th key={t}>{t}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((r) => (
                        <tr key={r.id}>
                          <td>
                            <b>{r.symbol}</b>
                            <small>
                              {r.payload.eligibility.route} ·{" "}
                              {time(r.published_at)}
                            </small>
                          </td>
                          <td>{predictorModels[r.model]?.name}</td>
                          <td>{num(r.payload.reference)}</td>
                          <td>
                            <b>{num(r.payload.predicted)}</b>
                            <small
                              className={
                                r.payload.predicted >= r.payload.reference
                                  ? styles.good
                                  : styles.bad
                              }
                            >
                              {num(
                                100 *
                                  (r.payload.predicted / r.payload.reference -
                                    1),
                              )}
                              %
                            </small>
                          </td>
                          <td>
                            <Range row={r} />
                            <small>
                              {num(r.payload.low)} – {num(r.payload.high)}
                            </small>
                          </td>
                          <td>
                            {num(100 * r.payload.probabilityAboveReference, 0)}%
                            <small>Empirical estimate</small>
                          </td>
                          <td>
                            {r.payload.condition}
                            <small>
                              {r.payload.sampleCount} training sessions ·
                              through {r.payload.trainedThrough}
                            </small>
                          </td>
                          <td>
                            {r.outcome
                              ? `Close ${num(r.outcome.actual)}`
                              : "Awaiting EOD close"}
                            <button
                              onClick={async () => {
                                setDetailError("");
                                try {
                                  setDetail(
                                    await getJson(
                                      `/v1/predictor/evidence/${r.id}`,
                                    ),
                                  );
                                } catch {
                                  setDetailError(
                                    "Evidence could not be loaded.",
                                  );
                                }
                              }}
                            >
                              Inspect inputs
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
          {tab === "EOD scorecard" && (
            <section>
              <h2>Which model worked today?</h2>
              <p className={styles.caption}>
                Ranked by smallest absolute closing-price error on identical
                evaluated instruments. Forecast accuracy is not realised trading
                profit.
              </p>
              <div className={styles.table}>
                <table>
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Model</th>
                      <th>Matched observations</th>
                      <th>Mean error %</th>
                      <th>Direction correct</th>
                      <th>Band coverage</th>
                      <th>Brier score ↓</th>
                      <th>Evidence strength</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaders.map((r, i) => (
                      <tr key={r.model}>
                        <td>{r.n ? i + 1 : "—"}</td>
                        <td>{predictorModels[r.model].name}</td>
                        <td>{r.n}</td>
                        <td>{num(r.mae)}</td>
                        <td>{num(r.hits == null ? null : r.hits * 100, 0)}%</td>
                        <td>
                          {num(r.coverage == null ? null : r.coverage * 100, 0)}
                          %
                        </td>
                        <td>{num(r.brier, 3)}</td>
                        <td>
                          {r.n < 10
                            ? "Too few observations to trust a winner"
                            : "Descriptive only; verify across sessions"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!completed && (
                <p>
                  No scored forward outcomes yet. Scoring starts one hour after
                  the close and waits for a valid daily close.
                </p>
              )}
              <h3>Performance by morning conditions</h3>
              <div className={styles.table}>
                <table>
                  <thead>
                    <tr>
                      <th>Condition</th>
                      <th>Model</th>
                      <th>N</th>
                      <th>Error %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ...new Set(filtered.map((r) => r.payload.condition)),
                    ].flatMap((c) =>
                      predictorLeaderboard(
                        filtered.filter((r) => r.payload.condition === c),
                      ).map((r) => (
                        <tr key={c + r.model}>
                          <td>{c}</td>
                          <td>{predictorModels[r.model].name}</td>
                          <td>{r.n}</td>
                          <td>{num(r.mae)}</td>
                        </tr>
                      )),
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          {tab === "Historical lab" && (
            <section>
              <h2>
                Historical walk-forward tests{" "}
                <small>Not saved live predictions</small>
              </h2>
              <p className={styles.notice}>
                Each test trains only on earlier dates. Historical prices may
                have been corrected later. This is a daily-open model study—not
                an OIIS/MWD portfolio or intraday forecast backtest.
              </p>
              <div className={styles.actions}>
                <label>
                  Study instrument{" "}
                  <select
                    value={studySymbol}
                    onChange={(e) => {
                      setStudySymbol(e.target.value);
                      setRegime("ALL");
                    }}
                  >
                    {data.studies.map((s) => (
                      <option key={s.symbol}>{s.symbol}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Morning conditions{" "}
                  <select
                    value={regime}
                    onChange={(e) => setRegime(e.target.value)}
                  >
                    <option value="ALL">All conditions</option>
                    {[...new Set(studyRows.map((r) => r.condition))].map(
                      (c) => (
                        <option key={c}>{c}</option>
                      ),
                    )}
                  </select>
                </label>
              </div>
              <p>
                {study?.payload.usableSessions ?? 0} usable examples ·{" "}
                {study?.payload.excludedSessions ?? 0} excluded after warm-up ·
                through {study?.payload.historyThrough ?? "—"}. Latest 60 valid
                sessions tested against up to 500 earlier sessions.
              </p>
              <div className={styles.table}>
                <table>
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Model</th>
                      <th>Test sessions</th>
                      <th>Mean return error · pp ↓</th>
                      <th>Direction correct</th>
                      <th>Improvement vs benchmark</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historical.map((r, i) => {
                      const base = historical.find(
                        (r) => r.model === "no-change",
                      )?.mae;
                      return (
                        <tr key={r.model}>
                          <td>{r.n ? i + 1 : "—"}</td>
                          <td>{predictorModels[r.model].name}</td>
                          <td>{r.n}</td>
                          <td>{num(r.mae, 3)}</td>
                          <td>{num(r.hit == null ? null : 100 * r.hit, 0)}%</td>
                          <td>
                            {num(
                              base && r.mae != null
                                ? 100 * (1 - r.mae / base)
                                : null,
                            )}
                            %
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <ErrorChart rows={studySelected} />
              {!studyRows.length && (
                <p>
                  At least 180 valid examples are required; history is
                  insufficient.
                </p>
              )}
            </section>
          )}
          {tab === "Models & eligibility" && (
            <section>
              <h2>How this works</h2>
              <div className={styles.models}>
                {Object.entries(predictorModels).map(([id, m]) => (
                  <article key={id}>
                    <h3>{m.name}</h3>
                    <p>{m.description}</p>
                    <small>
                      {id === "ridge"
                        ? "L2 penalty 10 · training-only standardisation"
                        : id === "similar-days"
                          ? "25 neighbours · standardised distance · no future neighbours"
                          : "Flat is distinct from a correct up/down call"}
                    </small>
                  </article>
                ))}
              </div>
              <p>
                Features: opening gap, previous return, 5/20-session momentum,
                20-session volatility and previous daily range. Models estimate
                the close, not the day's high/low. The band uses 10th–90th
                percentiles of 60 past walk-forward errors. Coverage must be
                measured, not assumed.
              </p>
              <p>
                Random forests / gradient boosting are candidates for later
                validation. LSTM/Transformer models and language-model price
                guessing are not enabled: complexity is not evidence of better
                predictions. No OI, news or participant-by-strike ownership is
                invented.
              </p>
              <p>
                Stocks: latest completed same-day OIIS run,
                selected/recommended/auto-paper-selected; matching LONG/BULL or
                SHORT/BEAR M−1 + W0 + W−1 + D0 must pass. M−2 adds M−1
                sufficiency. Hour/minute gates are not required here. NIFTY is
                separate; missing gates remain unavailable.
              </p>
              <h3>
                Latest worker eligibility · {data.status?.payload.day ?? "—"}
              </h3>
              <p>
                {data.status?.payload.candidateCount ?? 0} OIIS candidates
                considered. Rejected rows below are diagnostics, not
                recommendations.
              </p>
              <div className={styles.table}>
                <table>
                  <thead>
                    <tr>
                      <th>Symbol</th>
                      <th>Direction</th>
                      <th>State</th>
                      <th>MWD evidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.status?.payload.eligibility.map((r) => (
                      <tr key={r.symbol}>
                        <td>{r.symbol}</td>
                        <td>{r.direction}</td>
                        <td>{r.state.replaceAll("_", " ")}</td>
                        <td>
                          {r.eligibility?.gates.map((g) => (
                            <span
                              className={
                                g.passed === null
                                  ? styles.neutral
                                  : g.passed
                                    ? styles.good
                                    : styles.bad
                              }
                              key={g.name}
                              title={`${num(g.actual)} ${g.operator} ${num(g.reference)}`}
                            >
                              {g.name}{" "}
                              {g.passed === null ? "—" : g.passed ? "✓" : "×"}{" "}
                              ·{" "}
                            </span>
                          )) ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p>
                Times are IST. Full forecast evidence includes model parameters
                and training history. Paper/live orders and existing strategies
                are unchanged.
              </p>
              <p>
                <a
                  href="https://scikit-learn.org/stable/auto_examples/applications/plot_time_series_lagged_features.html"
                  target="_blank"
                  rel="noreferrer"
                >
                  Time-aware evaluation
                </a>{" "}
                ·{" "}
                <a
                  href="https://scikit-learn.org/stable/modules/linear_model.html#ridge-regression-and-classification"
                  target="_blank"
                  rel="noreferrer"
                >
                  Regularisation
                </a>{" "}
                ·{" "}
                <a
                  href="https://scikit-learn.org/stable/modules/neighbors.html#nearest-neighbors-regression"
                  target="_blank"
                  rel="noreferrer"
                >
                  Similar-day methods
                </a>
              </p>
            </section>
          )}
        </>
      )}
      {detailError && <p role="alert">{detailError}</p>}
      {detail != null && (
        <aside className={styles.drawer} aria-label="Forecast evidence">
          <button onClick={() => setDetail(null)}>Close evidence</button>
          <button
            onClick={() =>
              save(
                "predictor-full-evidence.json",
                JSON.stringify(detail, null, 2),
              )
            }
          >
            Download full inputs
          </button>
          <h2>Saved forecast evidence</h2>
          <p>
            Exact prices, model parameters, history, source times and
            eligibility at publication.
          </p>
          <pre>{JSON.stringify(detail, null, 2)}</pre>
        </aside>
      )}
    </main>
  );
}
