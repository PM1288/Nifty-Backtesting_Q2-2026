import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getJson } from "../lib/api";
import { evidenceCsv } from "../lib/tradingAnalyticsExport";
import {
  filtered,
  flatten,
  horizons,
  instrumentEvidence,
  number,
  numeric,
  object,
  Observation,
  presets,
  readState,
  side,
  textValue,
  time,
  windowEvidence,
} from "../lib/tradeObservation";
import {
  downloadLegacyCsv,
  TradingAnalyticsTradeLog as LegacyTradeLog,
} from "./TradingAnalyticsTradeLogLegacy";
import styles from "./TradingAnalyticsTradeLog.module.css";
import { TradeObservationPnl } from './TradeObservationPnl';

type Payload = {
  rows: Observation[];
  count: number;
  paperOrdersEnabled: false;
  version: string;
};
type Column = {
  key: string;
  label: string;
  numeric?: boolean;
  read: (r: Observation) => unknown;
  digits?: number;
  signed?: boolean;
};
const sections = [
  "Overview",
  "Conditions",
  "Indicators",
  "Outcomes",
  "Contracts & sources",
  "Delivery",
  "Raw record",
];
function save(name: string, content: string, json = false) {
  const url = URL.createObjectURL(
    new Blob([content], {
      type: json ? "application/json" : "text/csv;charset=utf-8",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Facts({ record }: { record: Observation }) {
  return (
    <dl className={styles.facts}>
      {Object.entries(flatten(record)).map(([k, v]) => (
        <div key={k}>
          <dt>{k.replaceAll("_", " ")}</dt>
          <dd>{textValue(v)}</dd>
        </div>
      ))}
    </dl>
  );
}
function Inspector({
  row,
  section,
  onSection,
  onClose,
  onStep,
  position,
}: {
  row: Observation;
  section: string;
  onSection: (s: string) => void;
  onClose: () => void;
  onStep: (n: number) => void;
  position: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const origin = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => {
      dialog.current?.close();
      origin?.isConnected && origin.focus();
    };
  }, []);
  const conditions = object(row.condition_evidence);
  const other = Object.fromEntries(
    Object.entries(row).filter(
      ([k]) =>
        ![
          "condition_evidence",
          "indicator_evidence",
          "outcome_evidence",
        ].includes(k),
    ),
  );
  return createPortal(
    <dialog
      ref={dialog}
      className={styles.inspector}
      aria-labelledby="observation-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.inspectorBody}>
        <header className={styles.toolbar}>
          <h2 id="observation-title">
            {textValue(row.underlying_symbol)} · {textValue(row.direction)}
          </h2>
          <span>READ-ONLY</span>
          <button
            onClick={onClose}
            autoFocus
            aria-label="Close observation inspector"
          >
            Close ×
          </button>
        </header>
        <div className={styles.toolbar}>
          <button onClick={() => onStep(-1)}>← Previous</button>
          <span>{position}</span>
          <button onClick={() => onStep(1)}>Next →</button>
          <button
            onClick={() =>
              save(`${row.signal_key}.json`, JSON.stringify(row, null, 2), true)
            }
          >
            Selected JSON
          </button>
        </div>
        <nav
          aria-label="Observation detail sections"
          className={styles.toolbar}
        >
          {sections.map((s) => (
            <button
              key={s}
              aria-current={section === s ? "page" : undefined}
              onClick={() => onSection(s)}
            >
              {s}
            </button>
          ))}
        </nav>
        <div
          className={styles.detail}
          tabIndex={0}
          role="region"
          aria-label={`${section} evidence`}
        >
          {section === "Overview" && (
            <>
              <TradeObservationPnl key={String(row.signal_key)} row={row}/>
              <p>
                Observed next-candle OPEN prices, not fills or realised P&amp;L.
                Entry candle end: {time(row.entry_end)} IST. Setup end:{" "}
                {time(row.setup_end)} IST.
              </p>
              {!side(row) && (
                <p role="status">
                  Selected contract identity unavailable or conflicting.
                  Selected-side outcomes are withheld.
                </p>
              )}
              <details><summary>Full observation fields</summary><Facts record={other} /></details>
            </>
          )}
          {section === "Conditions" && (
            <>
              <p>
                Stored V7 gate evidence. Candle colour is context, not a
                required gate. No pass state is inferred from the existence of a
                row.
              </p>
              <div
                className={styles.scroll}
                tabIndex={0}
                role="region"
                aria-label="Precursor candles"
              >
                <table>
                  <thead>
                    <tr>
                      <th>Instrument / precursor</th>
                      <th>End (IST)</th>
                      <th>Open</th>
                      <th>Close</th>
                      <th>EMA9</th>
                      <th>Colour</th>
                      <th>Close vs EMA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      "underlying_precursors",
                      "selected_option_precursors",
                    ].flatMap((k) =>
                      (Array.isArray(conditions[k])
                        ? (conditions[k] as unknown[])
                        : []
                      ).map((v, i) => {
                        const c = object(v);
                        return (
                          <tr key={`${k}${i}`}>
                            <th>
                              {k.replaceAll("_", " ")} {i + 1}
                            </th>
                            <td>{time(c.end)}</td>
                            {["open", "close", "ema9"].map((f) => (
                              <td key={f}>{numeric(c[f], 4)}</td>
                            ))}
                            <td>{textValue(c.colour)}</td>
                            <td>{textValue(c.close_vs_ema9)}</td>
                          </tr>
                        );
                      }),
                    )}
                  </tbody>
                </table>
              </div>
              <Facts
                record={{
                  underlying_setup_close: row.underlying_setup_close,
                  underlying_ema9: row.underlying_ema9,
                  underlying_body_fraction: row.underlying_body_fraction,
                  option_setup_close: row.option_setup_close,
                  option_ema9: row.option_ema9,
                  option_body_fraction: row.option_body_fraction,
                  ...conditions,
                }}
              />
            </>
          )}
          {section === "Indicators" && (
            <>
              <p>
                Recorded at setup end, {time(row.setup_end)} IST. Display
                precision four decimals; exact API precision below.
              </p>
              <div
                className={styles.scroll}
                tabIndex={0}
                role="region"
                aria-label="Indicator values"
              >
                <table>
                  <thead>
                    <tr>
                      <th>Instrument</th>
                      {["RSI14", "MACD", "Signal9", "Histogram"].map((f) => (
                        <th key={f}>{f}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {["underlying", "ce", "pe"].map((k) => (
                      <tr key={k}>
                        <th>{k.toUpperCase()}</th>
                        {[
                          "rsi14",
                          "macd",
                          "macd_signal9",
                          "macd_histogram",
                        ].map((f) => (
                          <td key={f}>
                            {numeric(
                              object(object(row.indicator_evidence)[k])[f],
                              4,
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Facts record={object(row.indicator_evidence)} />
            </>
          )}
          {section === "Outcomes" && (
            <>
              <p>
                High / low are observed excursions, not realised profit.
                Endpoint is the latest observed close. Recorded times label
                minute-bar starts. Elapsed maturity does not certify complete
                data coverage.
              </p>
              {horizons.map((h) => (
                <section key={h}>
                  <h3>
                    {h.toUpperCase()} ·{" "}
                    {textValue(windowEvidence(row, h).maturity)}{" "}
                    {windowEvidence(row, h).maturity === "DEVELOPING"
                      ? "· So far"
                      : ""}
                  </h3>
                  <div
                    className={styles.scroll}
                    tabIndex={0}
                    role="region"
                    aria-label={`${h} instrument outcomes`}
                  >
                    <table>
                      <thead>
                        <tr>
                          <th>Instrument</th>
                          <th>Endpoint</th>
                          <th>Change %</th>
                          <th>High</th>
                          <th>Low</th>
                          <th>Trend</th>
                          <th>Minutes</th>
                          <th>State</th>
                        </tr>
                      </thead>
                      <tbody>
                        {["underlying", "ce", "pe"].map((k) => {
                          const d = instrumentEvidence(row, h, k);
                          return (
                            <tr key={k}>
                              <th>{k.toUpperCase()}</th>
                              {[
                                "endpoint",
                                "endpoint_change_pct",
                                "max",
                                "min",
                              ].map((f) => (
                                <td key={f}>
                                  {numeric(
                                    d[f],
                                    2,
                                    f === "endpoint_change_pct",
                                  )}
                                </td>
                              ))}
                              <td>{textValue(d.trend)}</td>
                              <td>{textValue(d.observed_minutes)}</td>
                              <td>{textValue(d.state)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <details>
                    <summary>
                      Exact {h.toUpperCase()} values, timestamps and coverage
                    </summary>
                    <Facts record={windowEvidence(row, h)} />
                  </details>
                </section>
              ))}
            </>
          )}
          {section === "Contracts & sources" && (
            <>
              <p>
                Exact recorded identities; no ATM substitution. Any provenance
                not supplied by this endpoint remains unavailable.
              </p>
              <Facts record={other} />
            </>
          )}
          {section === "Delivery" && (
            <>
              <p>
                Notification delivery only. FAILED or SUPPRESSED is not a losing
                trade. This view cannot send or resend messages.
              </p>
              <Facts
                record={Object.fromEntries(
                  Object.entries(other).filter(([k]) =>
                    /deliver|created|updated|signal_key/.test(k),
                  ),
                )}
              />
            </>
          )}
          {section === "Raw record" && (
            <pre className={styles.raw}>{JSON.stringify(row, null, 2)}</pre>
          )}
        </div>
      </div>
    </dialog>,
    document.body,
  );
}

export function TradingAnalyticsTradeLog() {
  const [params] = useSearchParams();
  return params.get("logLayout") === "legacy" ? (
    <LegacyTradeLog />
  ) : (
    <ObservationLog />
  );
}

function ObservationLog() {
  const [params, setParams] = useSearchParams();
  const state = readState(params);
  const change = (key: string, v: string) => {
    setParams((previous) => {
      const p = new URLSearchParams(previous);
      v ? p.set(key, v) : p.delete(key);
      return p;
    });
  };
  const request = new URLSearchParams({ limit: "5000" });
  if (state.date) request.set("date", state.date);
  if (state.interval) request.set("interval", state.interval);
  if (state.direction) request.set("direction", state.direction);
  const requestKey = request.toString();
  const q = useQuery({
    queryKey: ["scalper-trade-log", requestKey],
    queryFn: () =>
      getJson<Payload>(`/v1/trading-analytics/scalper-log?${requestKey}`),
    placeholderData: keepPreviousData,
    staleTime: 30000,
    refetchInterval: 60000,
    retry: 1,
  });
  const [snapshot, setSnapshot] = useState<{
    key: string;
    rows: Observation[];
  }>({ key: "", rows: [] });
  const inspect = params.get("logInspect");
  const section = sections.includes(params.get("logSection") ?? "")
    ? params.get("logSection")!
    : "Overview";
  const [cached, setCached] = useState<Observation | null>(null);
  const [sort, setSort] = useState(false);
  const [fieldSearch, setFieldSearch] = useState("");
  const [fields, setFields] = useState<string[] | null>(null);
  const compact = params.get("logDensity") === "compact";
  const setCompact = (v: boolean) =>
    change("logDensity", v ? "compact" : "comfortable");
  useEffect(() => {
    if (!q.data || q.isPlaceholderData) return;
    const byKey = new Map(q.data.rows.map((row) => [row.signal_key, row]));
    setSnapshot((previous) => ({
      key: requestKey,
      rows:
        previous.key === requestKey && (inspect || sort)
          ? previous.rows.map((old) => byKey.get(old.signal_key) ?? old)
          : q.data.rows,
    }));
  }, [q.data, q.isPlaceholderData, requestKey, inspect, sort]);
  const rows = useMemo(
    () => filtered(snapshot.rows, state),
    [
      snapshot.rows,
      state.search,
      state.horizon,
      state.maturity,
      state.alignment,
      state.delivery,
    ],
  );
  const pending =
    q.data?.rows.filter(
      (r) => !snapshot.rows.some((old) => old.signal_key === r.signal_key),
    ).length ?? 0;
  const current =
    snapshot.rows.find((r) => r.signal_key === inspect) ??
    (cached?.signal_key === inspect ? cached : null);
  useEffect(() => {
    if (current) setCached(current);
  }, [current]);
  const allFields = useMemo(
    () =>
      Array.from(
        new Set(snapshot.rows.flatMap((r) => Object.keys(flatten(r)))),
      ),
    [snapshot.rows],
  );
  const columns: Column[] = useMemo(() => {
    const col = (key: string, label: string, n = true): Column => ({
      key,
      label,
      numeric: n,
      read: (r) => r[key],
    });
    const outcome = (
      h: typeof state.horizon,
      f: string,
      label: string,
      instrument?: string,
    ): Column => ({
      key: `${h}-${instrument ?? "selected"}-${f}`,
      label,
      numeric: true,
      signed: f.includes("change"),
      read: (r) => instrumentEvidence(r, h, instrument ?? side(r))[f],
    });
    if (state.preset === "Indicators")
      return ["underlying", "ce", "pe"].flatMap((k) =>
        ["rsi14", "macd", "macd_signal9", "macd_histogram"].map((f) => ({
          key: `${k}-${f}`,
          label: `${k.toUpperCase()} · ${f.replace("macd_", "")}`,
          numeric: true,
          digits: 4,
          read: (r: Observation) => object(object(r.indicator_evidence)[k])[f],
        })),
      );
    if (state.preset === "Entries & rules")
      return [
        col("underlying_entry_open", "Underlying open"),
        col("ce_entry_open", "CE open"),
        col("pe_entry_open", "PE open"),
        col("underlying_setup_close", "Underlying setup close"),
        col("underlying_ema9", "Underlying EMA9"),
        col("underlying_body_fraction", "Underlying body fraction"),
        col("option_setup_close", "Option setup close"),
        col("option_ema9", "Option EMA9"),
        col("option_body_fraction", "Option body fraction"),
        {
          key: "gates",
          label: "Stored gates",
          read: (r) => JSON.stringify(object(r.condition_evidence)),
        },
      ];
    if (state.preset === "Outcomes")
      return horizons.flatMap((h) => [
        outcome(
          h,
          state.metric === "underlying" ? "endpoint_change_pct" : state.metric,
          `${h.toUpperCase()} · ${state.metric === "underlying" ? "Underlying endpoint %" : state.metric.replaceAll("_", " ")}`,
          state.metric === "underlying" ? "underlying" : undefined,
        ),
        {
          key: `${h}-state`,
          label: `${h} window`,
          read: (r) => windowEvidence(r, h).maturity,
        },
      ]);
    if (state.preset === "Full evidence")
      return (fields ?? allFields.slice(0, 12)).map((f) => ({
        key: f,
        label: f,
        read: (r) => flatten(r)[f],
      }));
    return [
      col("underlying_entry_open", "Underlying open"),
      col("option_entry_open", "Selected open"),
      outcome(state.horizon, "endpoint", "Selected endpoint"),
      outcome(state.horizon, "endpoint_change_pct", "Endpoint Δ %"),
      outcome(state.horizon, "max_change_pct", "High Δ %"),
      outcome(state.horizon, "min_change_pct", "Low Δ %"),
      {
        key: "alignment",
        label: "Underlying alignment",
        read: (r) => windowEvidence(r, state.horizon).thesis_alignment,
      },
      {
        key: "maturity",
        label: `${state.horizon} window`,
        read: (r) => windowEvidence(r, state.horizon).maturity,
      },
      { key: "delivery", label: "Delivery", read: (r) => r.delivery_status },
    ];
  }, [state.preset, state.horizon, state.metric, fields, allFields]);
  const ordered = useMemo(
    () =>
      sort
        ? [...rows].sort((a, b) => {
            const av = number(
                instrumentEvidence(a, state.horizon, side(a))
                  .endpoint_change_pct,
              ),
              bv = number(
                instrumentEvidence(b, state.horizon, side(b))
                  .endpoint_change_pct,
              );
            return av === null
              ? bv === null
                ? 0
                : 1
              : bv === null
                ? -1
                : bv - av;
          })
        : rows,
    [rows, sort, state.horizon],
  );
  const open = (r: Observation) => {
    setCached(r);
    change("logInspect", String(r.signal_key));
  };
  const eligible = rows.filter((r) =>
    ["ALIGNED", "OPPOSED", "FLAT"].includes(
      String(windowEvidence(r, state.horizon).thesis_alignment),
    ),
  );
  const statuses = Array.from(
    new Set(snapshot.rows.map((r) => String(r.delivery_status ?? ""))),
  ).filter(Boolean);
  const select = (
    label: string,
    key: string,
    value: string,
    options: readonly string[],
    empty = false,
  ) => (
    <label>
      {label}
      <select
        aria-label={label}
        value={value}
        onChange={(e) => change(key, e.target.value)}
      >
        {empty && <option value="">All</option>}
        {options.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    </label>
  );
  const json = () =>
    save(
      "trade-observations-loaded-filtered.json",
      JSON.stringify(
        {
          scope: {
            limit: 5000,
            loaded: snapshot.rows.length,
            filtered: rows.length,
            request: snapshot.key,
          },
          rows,
        },
        null,
        2,
      ),
      true,
    );
  const visibleCsv = () =>
    save(
      "trade-observations-visible.csv",
      evidenceCsv(
        ordered.map((r) =>
          Object.fromEntries([
            ["signal_key", r.signal_key],
            ["stock", r.underlying_symbol],
            ...columns.map((c) => [c.key, c.read(r)]),
          ]),
        ),
      ),
    );
  return (
    <section
      className={styles.log}
      data-testid="trade-observations"
      data-density={compact ? "compact" : "comfortable"}
      aria-label="MANEESH trade observations"
    >
      <header className={styles.toolbar}>
        <h2>Trade observations</h2>
        <span>READ-ONLY · no paper orders</span>
        <span>
          Updated{" "}
          {q.dataUpdatedAt
            ? time(new Date(q.dataUpdatedAt).toISOString())
            : "—"}{" "}
          IST
        </span>
        <button disabled={q.isFetching} onClick={() => void q.refetch()}>
          {q.isFetching ? "Refreshing…" : "Refresh observations"}
        </button>
        <details className={styles.export}>
          <summary>Export</summary>
          <div>
            <button onClick={visibleCsv}>Visible columns CSV</button>
            <button
              onClick={() =>
                save(
                  "trade-observations-full-filtered.csv",
                  evidenceCsv(rows.map((r) => flatten(r))),
                )
              }
            >
              Full filtered CSV
            </button>
            <button onClick={json}>Full filtered JSON</button>
            <button onClick={() => downloadLegacyCsv(rows)}>Legacy CSV</button>
          </div>
        </details>
      </header>
      <div className={styles.summary}>
        <div>
          <span>Filtered observations</span>
          <strong>{rows.length}</strong>
          <small>
            {rows.filter((r) => r.direction === "CALL").length} CALL ·{" "}
            {rows.filter((r) => r.direction === "PUT").length} PUT
          </small>
        </div>
        <div>
          <span>{state.horizon.toUpperCase()} coverage</span>
          <strong>
            {
              rows.filter(
                (r) => windowEvidence(r, state.horizon).maturity === "MATURE",
              ).length
            }{" "}
            mature
          </strong>
          <small>
            {
              rows.filter(
                (r) =>
                  windowEvidence(r, state.horizon).maturity === "DEVELOPING",
              ).length
            }{" "}
            developing ·{" "}
            {
              rows.filter(
                (r) =>
                  !side(r) ||
                  !windowEvidence(r, state.horizon).maturity ||
                  instrumentEvidence(r, state.horizon, side(r)).state ===
                    "DATA_INSUFFICIENT",
              ).length
            }{" "}
            insufficient
          </small>
        </div>
        <div>
          <span>Underlying thesis aligned</span>
          <strong>
            {
              eligible.filter(
                (r) =>
                  windowEvidence(r, state.horizon).thesis_alignment ===
                  "ALIGNED",
              ).length
            }{" "}
            / {eligible.length}
          </strong>
          <small>Available alignment · not win rate</small>
        </div>
        <div>
          <span>Delivery attention</span>
          <strong>
            {rows.filter((r) => r.delivery_status === "FAILED").length} failed
          </strong>
          <small>
            {
              rows.filter((r) =>
                String(r.delivery_status ?? "").startsWith("SUPPRESSED"),
              ).length
            }{" "}
            suppressed · not trade outcome
          </small>
        </div>
      </div>
      <div className={styles.toolbar}>
        <label>
          Day
          <input
            type="date"
            value={state.date}
            onChange={(e) => change("logDate", e.target.value)}
          />
        </label>
        {select(
          "Interval",
          "logInterval",
          state.interval,
          ["1", "5", "15"],
          true,
        )}
        {select(
          "Thesis",
          "logDirection",
          state.direction,
          ["CALL", "PUT"],
          true,
        )}
        <label>
          Stock / contract
          <input
            placeholder="Search symbols"
            value={state.search}
            onChange={(e) => change("logSearch", e.target.value)}
          />
        </label>
        {select("Horizon", "logHorizon", state.horizon, horizons)}
        {select("Preset", "logPreset", state.preset, presets)}
        <details>
          <summary>More filters</summary>
          <div className={styles.toolbar}>
            {select(
              "Maturity",
              "logMaturity",
              state.maturity,
              ["MATURE", "DEVELOPING", "DATA_INSUFFICIENT"],
              true,
            )}
            {select(
              "Alignment",
              "logAlignment",
              state.alignment,
              ["ALIGNED", "OPPOSED", "FLAT", "DATA_INSUFFICIENT"],
              true,
            )}
            {select("Delivery", "logDelivery", state.delivery, statuses, true)}
          </div>
        </details>
        <button
          onClick={() =>
            setParams((previous) => {
              const p = new URLSearchParams(previous);
              for (const k of Array.from(p.keys()))
                if (k.startsWith("log")) p.delete(k);
              return p;
            })
          }
        >
          Clear log filters
        </button>
      </div>
      {(state.maturity || state.alignment || state.delivery) && (
        <div className={styles.toolbar}>
          {[
            ["logMaturity", state.maturity],
            ["logAlignment", state.alignment],
            ["logDelivery", state.delivery],
          ]
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <button key={k} onClick={() => change(k, "")}>
                {v} ×
              </button>
            ))}
        </div>
      )}
      <div className={styles.toolbar}>
        <span>
          {new URLSearchParams(snapshot.key).get("date") || "Current IST day"} ·{" "}
          {snapshot.rows.length} loaded (limit 5,000); exports include all
          matching loaded records, not a database-total claim.
        </span>
        <button aria-pressed={compact} onClick={() => setCompact(!compact)}>
          Compact spacing
        </button>
        <button aria-pressed={sort} onClick={() => setSort(!sort)}>
          Sort selected endpoint % {sort ? "↓" : "(off)"}
        </button>
        {state.preset === "Outcomes" &&
          select("Measure", "logMetric", state.metric, [
            "endpoint_change_pct",
            "max_change_pct",
            "min_change_pct",
            "underlying",
          ])}
      </div>
      {pending > 0 && (inspect || sort) && (
        <button
          onClick={() =>
            q.data && setSnapshot({ key: requestKey, rows: q.data.rows })
          }
        >
          Apply {pending} new observations
        </button>
      )}
      {q.isPlaceholderData && (
        <p role="status">
          Loading requested day/interval; previous query evidence remains
          visible until the new response arrives. Export scope remains the
          loaded query.
        </p>
      )}
      {q.error && (
        <p role="alert">
          Observation refresh failed. Last valid evidence is retained; no values
          were replaced with zero. Use Refresh observations to retry.
        </p>
      )}
      {state.preset === "Full evidence" && (
        <details open>
          <summary>
            Fields ({fields?.length ?? Math.min(12, allFields.length)} /{" "}
            {allFields.length})
          </summary>
          <label>
            Find field
            <input
              value={fieldSearch}
              onChange={(e) => setFieldSearch(e.target.value)}
            />
          </label>
          <button onClick={() => setFields(allFields)}>Show every field</button>
          <button onClick={() => setFields(null)}>Reset columns</button>
          <div className={styles.fields}>
            {allFields
              .filter((f) =>
                f.toLowerCase().includes(fieldSearch.toLowerCase()),
              )
              .map((f) => (
                <label key={f}>
                  <input
                    type="checkbox"
                    checked={(fields ?? allFields.slice(0, 12)).includes(f)}
                    onChange={(e) =>
                      setFields((previous) =>
                        e.target.checked
                          ? [...(previous ?? allFields.slice(0, 12)), f]
                          : (previous ?? allFields.slice(0, 12)).filter(
                              (k) => k !== f,
                            ),
                      )
                    }
                  />
                  {f}
                </label>
              ))}
          </div>
        </details>
      )}
      <div
        className={styles.scroll}
        tabIndex={0}
        role="region"
        aria-label="Trade observation evidence table"
      >
        <table>
          <thead>
            {state.preset === "Indicators" && (
              <tr className={styles.groupHead}>
                <th scope="colgroup">Identity</th>
                {["Underlying", "CE", "PE"].map((name) => (
                  <th key={name} scope="colgroup" colSpan={4}>
                    {name} · setup snapshot
                  </th>
                ))}
                <th>Inspect</th>
              </tr>
            )}
            <tr>
              <th className={styles.identity}>
                Stock / thesis · candle end (IST)
              </th>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={c.numeric ? styles.numeric : undefined}
                >
                  {c.label}
                </th>
              ))}
              <th className={styles.action}>Evidence</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((r) => (
              <tr
                key={String(r.signal_key)}
                data-selected={r.signal_key === inspect}
              >
                <th scope="row" className={styles.identity}>
                  <button aria-label={`View ${r.underlying_symbol} high low and PnL`} onClick={()=>{change('logSection','Overview');open(r);}}><b>{textValue(r.underlying_symbol)}</b></button>{" "}
                  <span
                    className={
                      r.direction === "CALL"
                        ? styles.call
                        : r.direction === "PUT"
                          ? styles.put
                          : undefined
                    }
                  >
                    {textValue(r.direction)}
                  </span>
                  <small>
                    {time(r.entry_end)} · {textValue(r.interval_minutes)}m
                  </small>
                </th>
                {columns.map((c) => {
                  const v = c.read(r),
                    n = number(v);
                  return (
                    <td
                      key={c.key}
                      className={`${c.numeric ? styles.numeric : ""} ${c.signed && n !== null ? (n > 0 ? styles.positive : n < 0 ? styles.negative : "") : ""}`}
                    >
                      <span className={styles.cell} title={textValue(v)}>
                        {c.numeric
                          ? numeric(v, c.digits ?? 2, c.signed)
                          : textValue(v)}
                        {c.key === "maturity" && v === "DEVELOPING" && (
                          <small>So far</small>
                        )}
                      </span>
                    </td>
                  );
                })}
                <td className={styles.action}>
                  <button
                    aria-label={`Inspect ${r.underlying_symbol} ${r.signal_key}`}
                    onClick={() => open(r)}
                  >
                    Inspect
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <p>
            {q.isLoading
              ? "Loading stored observations…"
              : "No observations match the loaded day and filters. No synthetic rows are shown."}
          </p>
        )}
      </div>
      <p className={styles.note}>
        Entry = recorded next-candle OPEN, not an executed fill. Times above
        label candle ends. Selected outcome requires verified CALL→CE / PUT→PE
        identity. High and low are signed premium excursions, never realised
        P&amp;L. Inspect for all contracts, gates, exact values, coverage and
        source times.
      </p>
      {current && (
        <Inspector
          row={current}
          section={section}
          onSection={(s) => change("logSection", s)}
          onClose={() => change("logInspect", "")}
          position={
            rows.some((r) => r.signal_key === current.signal_key)
              ? `${rows.findIndex((r) => r.signal_key === current.signal_key) + 1} / ${rows.length}`
              : "Outside current filters"
          }
          onStep={(delta) => {
            const i = rows.findIndex(
              (r) => r.signal_key === current.signal_key,
            );
            const next = rows[i + delta];
            if (next) open(next);
          }}
        />
      )}
    </section>
  );
}
