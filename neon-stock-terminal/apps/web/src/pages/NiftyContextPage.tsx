import { useMemo, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getJson } from "../lib/api";
import styles from "./NiftyContextPage.module.css";
import NiftyContextValidation from "./NiftyContextValidation";

type Explanation = {
  feature_names: string[];
  groups: string[];
  direction_base: number[];
  direction_contributions: number[][];
  direction_output: number[];
  range_base: number;
  range_contributions: number[];
  range_output: number;
  background_id: string;
};
type Prediction = {
  id: string;
  result: {
    cutoff: string;
    window_end: string;
    probabilities: Record<string, number>;
    range_quantiles: Record<string, number>;
    features: Record<string, number>;
    actual: { log_return: number; range: number };
  };
  explanation: Explanation;
};
type Payload = {
  state: string;
  report: null | {
    run_id: string;
    created_at: string;
    reason: string;
    gaps: string[];
    coverage: {
      raw_minutes: number;
      raw_sessions: number;
      eligible_occasions: number;
      mature_occasions: number;
      rejected: unknown[];
    };
    session_coverage?: {
      session: string;
      minutes: number;
      eligible: number;
      mature: number;
    }[];
    evaluation: Record<string, unknown>;
    config: unknown;
    code_commit: string;
  };
  predictions: Prediction[];
  snapshots: unknown[];
};
const fmt = (v: unknown, d = 3) =>
  typeof v === "number" && Number.isFinite(v)
    ? v.toLocaleString("en-IN", { maximumFractionDigits: d })
    : "—";
const ist = (v: string) =>
  new Date(v).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
const labels = ["DOWN", "SMALL", "UP"];

function Waterfall({
  prediction,
  range,
  cls,
}: {
  prediction: Prediction;
  range: boolean;
  cls: number;
}) {
  const e = prediction.explanation;
  const base = range ? e.range_base : e.direction_base[cls];
  const values = range
    ? e.range_contributions
    : e.direction_contributions.map((v) => v[cls]);
  let cursor = base;
  const rows = [
    { label: "Reference", start: 0, end: base, value: base },
    ...values.map((v, i) => {
      const start = cursor;
      cursor += v;
      return { label: e.feature_names[i], start, end: cursor, value: v };
    }),
    {
      label: "Output",
      start: 0,
      end: range ? e.range_output : e.direction_output[cls],
      value: range ? e.range_output : e.direction_output[cls],
    },
  ];
  const lo = Math.min(0, ...rows.flatMap((r) => [r.start, r.end]));
  const hi = Math.max(0, ...rows.flatMap((r) => [r.start, r.end]));
  const x = (v: number) => 165 + ((v - lo) / Math.max(hi - lo, 1e-9)) * 420;
  return (
    <figure>
      <figcaption>
        {range
          ? "Median range · index points"
          : `${labels[cls]} · raw class margin (not percentage points)`}
      </figcaption>
      <div className={styles.waterfall}>
        <svg
          viewBox={`0 0 730 ${rows.length * 28}`}
          role="img"
          aria-label="SHAP waterfall: reference plus feature contributions equals model output"
        >
          {rows.map((r, i) => (
            <g key={r.label}>
              <text x="0" y={i * 28 + 18}>
                {r.label}
              </text>
              <rect
                x={Math.min(x(r.start), x(r.end))}
                y={i * 28 + 5}
                width={Math.max(Math.abs(x(r.end) - x(r.start)), 1)}
                height="16"
                fill={
                  i === 0 || i === rows.length - 1
                    ? "#315ad7"
                    : r.value >= 0
                      ? "#087a55"
                      : "#c93346"
                }
              />
              <text x="600" y={i * 28 + 18}>
                {fmt(r.value, 5)}
              </text>
              <title>
                {r.label}: {r.value}
              </title>
            </g>
          ))}
        </svg>
      </div>
      <details>
        <summary>Exact explanation table</summary>
        <table>
          <thead>
            <tr>
              <th>Feature</th>
              <th>Value</th>
              <th>Contribution</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td>{r.label}</td>
                <td>{fmt(prediction.result.features[r.label], 8)}</td>
                <td>{fmt(r.value, 8)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

export default function NiftyContextPage() {
  const [params, setParams] = useSearchParams();
  const lens = ["direction", "range", "validation", "audit"].includes(
    params.get("lens") ?? "",
  )
    ? params.get("lens")!
    : "direction";
  const cls = Math.max(0, labels.indexOf(params.get("class") ?? "UP"));
  const query = useQuery({
    queryKey: ["nifty-context"],
    queryFn: () => getJson<Payload>("/v1/nifty-context"),
    staleTime: 60_000,
    retry: 1,
  });
  const data = query.data;
  const predictions = data?.predictions ?? [];
  const selected =
    predictions.find((p) => p.id === params.get("prediction")) ??
    predictions.at(-1);
  const update = (key: string, val: string) => {
    const next = new URLSearchParams(params);
    next.set(key, val);
    setParams(next);
  };
  const families = useMemo(
    () => [...new Set(selected?.explanation.groups ?? [])],
    [selected],
  );
  const [exportError, setExportError] = useState("");
  const exportData = async () => {
    if (!data?.report) return;
    setExportError("");
    try {
      const payload = await getJson<unknown>(
        `/v1/nifty-context/export/${data.report.run_id}`,
      );
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(payload, null, 2)], {
          type: "application/json",
        }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "nifty-model-research.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setExportError(
        "Export failed. Your evidence remains saved; please retry.",
      );
    }
  };
  return (
    <section
      className={styles.page}
      data-testid="nifty-model-research"
      aria-label="NIFTY Model Research"
    >
      <header>
        <div>
          <h1>NIFTY Model Research</h1>
          <span>Shadow research · hourly direction and range</span>
        </div>
        <Link to="/strategy/trading-analytics?view=scalper">
          MANEESH charts
        </Link>
        <button
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
        >
          Refresh
        </button>
        <button onClick={() => void exportData()} disabled={!data?.report}>
          Export full evidence
        </button>
      </header>
      <nav aria-label="Research dashboards">
        {["direction", "range", "validation", "audit"].map((l) => (
          <button
            key={l}
            aria-pressed={lens === l}
            onClick={() => update("lens", l)}
          >
            {l === "direction"
              ? "Hourly direction"
              : l === "range"
                ? "Hourly range"
                : l === "validation"
                  ? "Model validation"
                  : "Data & audit"}
          </button>
        ))}
      </nav>
      {query.isLoading && <p role="status">Loading saved research…</p>}
      {query.error && (
        <p role="alert">Research service unavailable. Retry with Refresh.</p>
      )}
      {exportError && <p role="alert">{exportError}</p>}
      {data && (
        <p className={styles.status}>
          {data.state.replaceAll("_", " ")} ·{" "}
          {data.report?.reason ?? "No experiment has completed yet."}
        </p>
      )}
      {data?.report && (
        <section className={styles.metrics}>
          {Object.entries(data.report.coverage)
            .filter(([k]) => k !== "rejected")
            .map(([k, v]) => (
              <div key={k}>
                <span>{k.replaceAll("_", " ")}</span>
                <b>{fmt(v, 0)}</b>
              </div>
            ))}
        </section>
      )}
      {(lens === "audit" || data?.state === "DATA_INSUFFICIENT") &&
        data?.report?.session_coverage && (
          <section>
            <h2>Actual session coverage</h2>
            <p>
              Five hourly occasions per full session. Blue: eligible inputs;
              green: complete outcomes. Gaps remain missing, not zero-return
              observations.
            </p>
            <div className={styles.heatmap}>
              <table>
                <thead>
                  <tr>
                    <th>Session</th>
                    <th>Retained minutes</th>
                    <th>Eligible inputs / 5</th>
                    <th>Mature outcomes / 5</th>
                  </tr>
                </thead>
                <tbody>
                  {data.report.session_coverage.map((s) => (
                    <tr key={s.session}>
                      <th>{s.session}</th>
                      <td>{s.minutes}</td>
                      <td>
                        <meter
                          min="0"
                          max="5"
                          value={s.eligible}
                          aria-label={`${s.session} eligible hourly inputs`}
                        />{" "}
                        {s.eligible}
                      </td>
                      <td>
                        <meter
                          min="0"
                          max="5"
                          value={s.mature}
                          aria-label={`${s.session} mature hourly outcomes`}
                        />{" "}
                        {s.mature}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      {(lens === "direction" || lens === "range") && (
        <>
          <div className={styles.controls}>
            <label>
              Forecast window{" "}
              <select
                value={selected?.id ?? ""}
                onChange={(e) => update("prediction", e.target.value)}
              >
                <option value="" disabled>
                  No forecast selected
                </option>
                {predictions.map((p) => (
                  <option value={p.id} key={p.id}>
                    {ist(p.result.cutoff)} – {ist(p.result.window_end)} IST
                  </option>
                ))}
              </select>
            </label>
            {lens === "direction" && (
              <label>
                Explanation target{" "}
                <select
                  value={labels[cls]}
                  onChange={(e) => update("class", e.target.value)}
                >
                  {labels.map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {!selected ? (
            <p>
              No eligible model prediction is available. Review Data & audit for
              coverage and missing inputs.
            </p>
          ) : (
            <>
              <section className={styles.metrics}>
                {Object.entries(
                  lens === "direction"
                    ? selected.result.probabilities
                    : selected.result.range_quantiles,
                ).map(([k, v]) => (
                  <div key={k}>
                    <span>{lens === "range" ? `Range quantile ${k}` : k}</span>
                    <b>
                      {fmt(lens === "direction" ? v * 100 : v, 2)}
                      {lens === "direction" ? "%" : " points"}
                    </b>
                  </div>
                ))}
              </section>
              <p>
                Exploratory held-out replay · generated{" "}
                {data?.report ? ist(data.report.created_at) : "—"} IST ·
                original window {ist(selected.result.cutoff)} to{" "}
                {ist(selected.result.window_end)} IST.{" "}
                {lens === "range"
                  ? "Quantiles describe range size; they are not price boundaries."
                  : "Probabilities are uncalibrated model estimates."}
              </p>
              <div className={styles.workspace}>
                <Waterfall
                  prediction={selected}
                  range={lens === "range"}
                  cls={cls}
                />
                <section>
                  <h2>Chronological factor contributions</h2>
                  <p>
                    {lens === "range"
                      ? "Median range points"
                      : `${labels[cls]} class margin`}{" "}
                    · select a saved hour
                  </p>
                  <div className={styles.heatmap}>
                    <table>
                      <thead>
                        <tr>
                          <th>Family</th>
                          {predictions.map((p) => (
                            <th key={p.id}>
                              <button
                                onClick={() => update("prediction", p.id)}
                              >
                                {ist(p.result.cutoff)}
                              </button>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {families.map((f) => (
                          <tr key={f}>
                            <th>{f}</th>
                            {predictions.map((p) => {
                              const e = p.explanation;
                              const sum = e.groups.reduce(
                                (s, g, i) =>
                                  s +
                                  (g === f
                                    ? lens === "range"
                                      ? e.range_contributions[i]
                                      : e.direction_contributions[i][cls]
                                    : 0),
                                0,
                              );
                              return (
                                <td
                                  key={p.id}
                                  style={{
                                    background:
                                      sum >= 0 ? "#e7f7f0" : "#fff0f2",
                                  }}
                                >
                                  <button
                                    title={`${f}: ${sum}`}
                                    onClick={() => update("prediction", p.id)}
                                  >
                                    {sum > 0 ? "+" : ""}
                                    {fmt(sum, 4)}
                                  </button>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            </>
          )}
        </>
      )}
      {lens === "validation" && (
        <section>
          <h2>Held-out evaluation</h2>
          <p>
            Final sessions are held out chronologically. No threshold search or
            automatic promotion. Large feature contributions do not establish
            predictive value or causation.
          </p>
          <NiftyContextValidation evaluation={data?.report?.evaluation ?? {}} />
        </section>
      )}
      {lens === "audit" && (
        <section>
          <h2>Coverage and limitations</h2>
          <ul>
            {data?.report?.gaps.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
          <h2>Prospective hourly captures</h2>
          <pre>{JSON.stringify(data?.snapshots ?? [], null, 2)}</pre>
          <h2>Experiment configuration</h2>
          <pre>{JSON.stringify(data?.report, null, 2)}</pre>
        </section>
      )}
      <footer>
        Existing EMA9 rules and execution permissions are independent.{" "}
        <a
          href="https://shap.readthedocs.io/en/latest/generated/shap.TreeExplainer.html"
          target="_blank"
          rel="noreferrer"
        >
          SHAP units and methodology
        </a>
      </footer>
    </section>
  );
}
