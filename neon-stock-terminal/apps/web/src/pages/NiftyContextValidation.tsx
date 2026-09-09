type Bin = { count: number; predicted: number | null; observed: number | null };
type Metric = {
  log_loss: number;
  multiclass_brier: number;
  accuracy: number;
  reliability: { class: string; bins: Bin[] }[];
};
type Evaluation = {
  train_count?: number;
  test_count?: number;
  train_sessions?: number;
  test_sessions?: string[];
  shap_max_error?: number;
  range_shap_max_error?: number;
  metrics?: Record<string, unknown>;
};
const number = (n: unknown) =>
  typeof n === "number" && Number.isFinite(n)
    ? n.toLocaleString("en-IN", { maximumFractionDigits: 5 })
    : "—";

export default function NiftyContextValidation({
  evaluation,
}: {
  evaluation: Evaluation;
}) {
  const metrics = evaluation.metrics;
  if (!metrics)
    return (
      <p>
        No eligible held-out evaluation yet. Data & audit explains the missing
        coverage.
      </p>
    );
  const classifiers = ["frequency", "logistic", "xgboost"]
    .filter((n) => metrics[n])
    .map((n) => [n, metrics[n] as Metric] as const);
  const range = metrics.range as {
    baseline_mae: number;
    median_mae: number;
    interval_coverage: number;
    crossing_count: number;
    quantile_loss: Record<string, number>;
  };
  return (
    <>
      <p>
        Training: {number(evaluation.train_count)} occasions /{" "}
        {number(evaluation.train_sessions)} sessions. Held out:{" "}
        {number(evaluation.test_count)} occasions across{" "}
        {evaluation.test_sessions?.join(", ")}.
      </p>
      <div
        style={{ overflowX: "auto" }}
        tabIndex={0}
        role="region"
        aria-label="Direction benchmark table"
      >
        <table>
          <caption>
            Direction benchmarks · lower log loss and Brier are better
          </caption>
          <thead>
            <tr>
              <th>Model</th>
              <th>Log loss</th>
              <th>Multiclass Brier</th>
              <th>Accuracy</th>
            </tr>
          </thead>
          <tbody>
            {classifiers.map(([name, m]) => (
              <tr key={name}>
                <th>{name}</th>
                <td>{number(m.log_loss)}</td>
                <td>{number(m.multiclass_brier)}</td>
                <td>{number(m.accuracy * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>Reliability · predicted versus observed</h2>
      <p>
        Dashed diagonal is ideal reliability. Every point shows held-out bin
        count; empty bins are omitted. These small samples do not certify
        calibration.
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))",
          gap: 10,
        }}
      >
        {classifiers.map(([name, m]) => (
          <figure key={name}>
            <figcaption>{name} · DOWN blue, SMALL grey, UP green</figcaption>
            <svg
              viewBox="0 0 300 280"
              role="img"
              aria-label={`${name} reliability diagram, x predicted probability, y observed frequency`}
            >
              <path
                d="M35 20V240H270 M35 240L255 20"
                fill="none"
                stroke="#64748b"
                strokeDasharray="4 4"
              />
              <text x="30" y="257">
                0
              </text>
              <text x="248" y="257">
                1
              </text>
              <text x="10" y="25">
                1
              </text>
              <text x="75" y="275">
                Predicted probability
              </text>
              {m.reliability.flatMap((r, k) =>
                r.bins
                  .filter(
                    (b) =>
                      b.count > 0 &&
                      b.predicted !== null &&
                      b.observed !== null,
                  )
                  .map((b, i) => (
                    <circle
                      key={`${k}-${i}`}
                      cx={35 + b.predicted! * 220}
                      cy={240 - b.observed! * 220}
                      r="4"
                      fill={["#315ad7", "#53657d", "#087a55"][k]}
                    >
                      <title>
                        {r.class}: predicted {b.predicted}, observed{" "}
                        {b.observed}, n={b.count}
                      </title>
                    </circle>
                  )),
              )}
            </svg>
            <details>
              <summary>Accessible reliability data</summary>
              <table>
                <thead>
                  <tr>
                    <th>Class</th>
                    <th>Count</th>
                    <th>Predicted</th>
                    <th>Observed</th>
                  </tr>
                </thead>
                <tbody>
                  {m.reliability.flatMap((r) =>
                    r.bins.map((b, i) => (
                      <tr key={`${r.class}-${i}`}>
                        <th>{r.class}</th>
                        <td>{b.count}</td>
                        <td>{number(b.predicted)}</td>
                        <td>{number(b.observed)}</td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </details>
          </figure>
        ))}
      </div>
      <h2>Range benchmark · index points</h2>
      <div
        style={{ overflowX: "auto" }}
        tabIndex={0}
        role="region"
        aria-label="Range benchmark table"
      >
        <table>
          <thead>
            <tr>
              <th>Time-of-day baseline MAE</th>
              <th>Model median MAE</th>
              <th>10–90% coverage</th>
              <th>Quantile crossings</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{number(range.baseline_mae)}</td>
              <td>{number(range.median_mae)}</td>
              <td>{number(range.interval_coverage * 100)}%</td>
              <td>{number(range.crossing_count)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Pinball loss:{" "}
        {Object.entries(range.quantile_loss)
          .map(([q, v]) => `q${q}: ${number(v)}`)
          .join(" · ")}
        . No sorting or correction conceals quantile crossings.
      </p>
      <p>
        SHAP maximum reconciliation error: direction{" "}
        {evaluation.shap_max_error?.toExponential(3) ?? "—"}; range{" "}
        {evaluation.range_shap_max_error?.toExponential(3) ?? "—"}.
      </p>
      <details>
        <summary>Full evaluation JSON</summary>
        <pre tabIndex={0}>{JSON.stringify(evaluation, null, 2)}</pre>
      </details>
    </>
  );
}
