import styles from "./TradingAnalyticsPage.module.css";
type Row = Record<string, unknown>;
const matrix = [
  ["Buy", "Buy", "Buy", "Super Bullish"],
  ["Buy", "Buy", "Sell", "Bullish"],
  ["Buy", "Sell", "Sell", "Sideways (Bearish)"],
  ["Sell", "Sell", "Buy", "Bearish"],
  ["Sell", "Sell", "Sell", "Super Bearish"],
  ["Sell", "Buy", "Buy", "Sideways (Bullish)"],
];
const value = (v: unknown) =>
  v == null
    ? "—"
    : typeof v === "number" ||
        (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v))
      ? new Intl.NumberFormat("en-IN", {
          maximumFractionDigits: 2,
          signDisplay: "exceptZero",
        }).format(Number(v))
      : String(v);
const tint = (v: unknown) =>
  v == null
    ? styles.missing
    : Number(v) < 0
      ? styles.negative
      : Number(v) > 0
        ? styles.positive
        : "";
export function TradingAnalyticsMorning({
  activity,
  participants,
  morning,
  smartapi,
  onInspect,
  onStructure,
}: {
  activity: Row[];
  participants: Row[];
  morning: {
    matrix: string;
    cash: Row[];
    cashNet: number | null;
    cashSign: string | null;
    knowledgeState: string;
  };
  smartapi: {
    expiry: string | null;
    metrics: { oiPcr: number | null; volumePcr: number | null };
  };
  onInspect: (row: Row) => void;
  onStructure: () => void;
}) {
  const fii = participants.find((r) => r.client_type === "FII");
  return (
    <div className={styles.morningSheet}>
      <section>
        <h3>NIFTY · display-window PCR / expiry</h3>
        <table>
          <thead>
            <tr>
              <th>Listed expiry</th>
              <th>OI PCR</th>
              <th>Volume PCR</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>{smartapi.expiry ?? "Unavailable"}</th>
              <td>{value(smartapi.metrics.oiPcr)}</td>
              <td>{value(smartapi.metrics.volumePcr)}</td>
            </tr>
          </tbody>
        </table>
        <p>
          SmartAPI · ten paired strikes, not full chain. Max pain unavailable:
          normalized exposure not verified.
        </p>
      </section>
      <section>
        <h3>BANKNIFTY · PCR / expiry context</h3>
        <p>
          Unavailable in this endpoint. NIFTY data is not substituted. No weekly
          expiry is invented.
        </p>
      </section>
      <section>
        <h3>Daily activity · FII</h3>
        <table>
          <thead>
            <tr>
              <th>Segment</th>
              <th>Net value · ₹ crore</th>
              <th>Activity</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>Cash Mkt</th>
              <td className={tint(morning.cashNet)}>
                <button
                  className={styles.metricButton}
                  onClick={() =>
                    onInspect({
                      scope: "Cash market",
                      rows: morning.cash,
                      reason: morning.knowledgeState,
                    })
                  }
                >
                  {value(morning.cashNet)}
                </button>
              </td>
              <td>{morning.cashSign ?? "Unavailable"}</td>
            </tr>
            {[
              "INDEX FUTURES",
              "INDEX OPTIONS",
              "STOCK FUTURES",
              "STOCK OPTIONS",
            ].map((name, i) => {
              const r = activity.find((v) => v.fii_derivatives === name);
              return (
                <tr key={name}>
                  <th>{["Indx Fut", "Indx Opt", "Stk Fut", "Stk Opt"][i]}</th>
                  <td className={tint(r?.net_crore)}>
                    <button
                      className={styles.metricButton}
                      onClick={() =>
                        onInspect(r ?? { reason: "Missing product", name })
                      }
                    >
                      {value(r?.net_crore)}
                    </button>
                  </td>
                  <td>{String(r?.canonical_sign ?? "Missing")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p>
          All index derivatives, not NIFTY-only. Options reported value is not
          premium cash flow.
        </p>
      </section>
      <section>
        <h3>FII index OI · position and comparison</h3>
        <table>
          <thead>
            <tr>
              <th>Measure</th>
              <th>Current position</th>
              <th>Comparison change</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["Index futures", "net_futures"],
              ["Options proxy (contracts)", "options_proxy"],
              ["Futures long %", "futures_long_pct"],
            ].map(([label, key]) => (
              <tr key={key}>
                <th>{label}</th>
                <td className={key.endsWith("pct") ? "" : tint(fii?.[key])}>
                  <button
                    className={styles.metricButton}
                    onClick={() =>
                      onInspect(fii ?? { reason: "Participant unavailable" })
                    }
                  >
                    {value(fii?.[key])}
                    {key.endsWith("pct") && fii?.[key] != null ? "%" : ""}
                  </button>
                </td>
                <td>—</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          Comparison baseline not supplied by current API. Missing change is not
          zero. Percentage is only index-futures long share.
        </p>
      </section>
      <section>
        <h3>Original six-row market matrix</h3>
        <table>
          <thead>
            <tr>
              <th>Equity</th>
              <th>Futures</th>
              <th>Options</th>
              <th>Analysis</th>
            </tr>
          </thead>
          <tbody>
            {matrix.map((row) => (
              <tr key={row[3]} aria-selected={row[3] === morning.matrix}>
                {row.map((v, i) => (
                  <td
                    key={i}
                    className={
                      i < 3
                        ? v === "Buy"
                          ? styles.positive
                          : styles.negative
                        : ""
                    }
                  >
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section>
        <h3>Morning interpretation</h3>
        <p className={styles.warning}>{morning.matrix.replaceAll("_", " ")}</p>
        <p>
          Activity → outstanding positions → price → exact option → OI context →
          recorded research evidence.
        </p>
        <p>
          Unmapped or missing inputs cannot select an invented matrix row.
          Read-only · policy incomplete.
        </p>
        <button onClick={onStructure}>Open Market Structure</button>
      </section>
    </div>
  );
}
