import { useMemo, type CSSProperties } from "react";
import {
  participantHeatmapExtent,
  participantHeatmapReading,
  type ParticipantHeatmapExtent,
} from "../lib/participantHeatmap";
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
const participantOrder = ["FII", "Pro", "Client", "DII"];
const participantHeatmapKeys = [
  "previous_net_calls", "net_calls", "delta_net_calls",
  "previous_net_puts", "net_puts", "delta_net_puts",
  "previous_options_proxy", "options_proxy", "delta_options_proxy",
] as const;
type ParticipantHeatmapKey = (typeof participantHeatmapKeys)[number];
const participantLabel = (type: unknown) =>
  type === "Client" ? "Client (reported)" : String(type ?? "Unavailable");
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
  const participantRows = useMemo(
    () => new Map(participants.map((row) => [String(row.client_type), row])),
    [participants],
  );
  const participantHeatmapExtents = useMemo(
    () => Object.fromEntries(participantHeatmapKeys.map((key) => [
      key,
      participantHeatmapExtent(participantOrder.map((type) => participantRows.get(type)?.[key])),
    ])) as Record<ParticipantHeatmapKey, ParticipantHeatmapExtent>,
    [participantRows],
  );
  const participantHeatCell = (candidate: unknown, key: ParticipantHeatmapKey) => {
    const reading = participantHeatmapReading(candidate, participantHeatmapExtents[key]);
    const percentage = Math.round(reading.strength * 100);
    return {
      className: `${styles.participantHeatCell} ${
        reading.tone === "positive"
          ? styles.participantHeatPositive
          : reading.tone === "negative"
            ? styles.participantHeatNegative
            : reading.tone === "missing"
              ? styles.participantHeatMissing
              : styles.participantHeatNeutral
      }`,
      style: {
        "--participant-heat-alpha": (
          reading.tone === "positive"
            ? 0.10 + reading.strength * 0.34
            : reading.tone === "negative"
              ? 0.09 + reading.strength * 0.32
              : 0
        ).toFixed(4),
      } as CSSProperties,
      "data-heatmap-tone": reading.tone,
      "data-heatmap-strength": reading.strength.toFixed(4),
      title: reading.tone === "missing"
        ? "Unavailable · excluded from heatmap range"
        : reading.tone === "neutral"
          ? "Zero · neutral"
          : `${reading.tone === "positive" ? "Positive" : "Negative"} · ${percentage}% of this column's ${reading.tone} extreme`,
    };
  };
  return (
    <div className={styles.morningSheet}>
      <section>
        <h2>NIFTY · display-window PCR / expiry</h2>
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
        <h2>BANKNIFTY · PCR / expiry context</h2>
        <p>
          Unavailable in this endpoint. NIFTY data is not substituted. No weekly
          expiry is invented.
        </p>
      </section>
      <section>
        <h2>Daily activity · FII</h2>
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
        <h2>FII index OI · position and comparison</h2>
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
              ["Index futures", "net_futures", "delta_net_futures"],
              ["Options proxy (contracts)", "options_proxy", "delta_options_proxy"],
              ["Futures long %", "futures_long_pct", "futures_long_pct_change_pp"],
            ].map(([label, key, changeKey]) => (
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
                <td className={tint(fii?.[changeKey])}>
                  {value(fii?.[changeKey])}
                  {changeKey.endsWith("_pp") && fii?.[changeKey] != null ? " pp" : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          Comparison uses the preceding retained trading report for the same
          participant. Missing reports remain unavailable, never zero.
          Percentage change is shown in percentage points.
        </p>
      </section>
      <section className={styles.morningWideSection} data-testid="morning-participant-comparison">
        <h2>Participant index options · current vs previous report</h2>
        <div className={styles.participantHeatLegend} aria-label="Participant heatmap legend">
          <span><i className={styles.participantHeatPositive} aria-hidden="true" /> Positive · green</span>
          <span><i className={styles.participantHeatNegative} aria-hidden="true" /> Negative · red</span>
          <span>Deeper shade = larger magnitude within that column; zero and unavailable are neutral.</span>
        </div>
        <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Participant call and put comparison scroll area">
          <table aria-label="FII Pro Client and DII call put comparison" data-testid="morning-participant-summary-table">
            <thead>
              <tr>
                <th rowSpan={2}>Participant</th>
                <th rowSpan={2}>Previous report</th>
                <th colSpan={3}>Net calls · contracts</th>
                <th colSpan={3}>Net puts · contracts</th>
                <th colSpan={3}>Options proxy · contracts</th>
                <th rowSpan={2}>State</th>
              </tr>
              <tr>
                <th>Previous</th><th>Current</th><th>Change</th>
                <th>Previous</th><th>Current</th><th>Change</th>
                <th>Previous</th><th>Current</th><th>Change</th>
              </tr>
            </thead>
            <tbody>
              {participantOrder.map((type) => {
                const row = participantRows.get(type);
                return (
                  <tr key={type}>
                    <th>{participantLabel(type)}</th>
                    <td>{value(row?.previous_trade_date)}</td>
                    <td {...participantHeatCell(row?.previous_net_calls, "previous_net_calls")}>{value(row?.previous_net_calls)}</td>
                    <td {...participantHeatCell(row?.net_calls, "net_calls")}>{value(row?.net_calls)}</td>
                    <td {...participantHeatCell(row?.delta_net_calls, "delta_net_calls")}>{value(row?.delta_net_calls)}</td>
                    <td {...participantHeatCell(row?.previous_net_puts, "previous_net_puts")}>{value(row?.previous_net_puts)}</td>
                    <td {...participantHeatCell(row?.net_puts, "net_puts")}>{value(row?.net_puts)}</td>
                    <td {...participantHeatCell(row?.delta_net_puts, "delta_net_puts")}>{value(row?.delta_net_puts)}</td>
                    <td {...participantHeatCell(row?.previous_options_proxy, "previous_options_proxy")}>{value(row?.previous_options_proxy)}</td>
                    <td {...participantHeatCell(row?.options_proxy, "options_proxy")}>{value(row?.options_proxy)}</td>
                    <td {...participantHeatCell(row?.delta_options_proxy, "delta_options_proxy")}>{value(row?.delta_options_proxy)}</td>
                    <td>
                      <button className={styles.metricButton} onClick={() => onInspect(row ?? { client_type: type, reason: "Participant unavailable" })}>
                        {String(row?.comparison_state ?? "Unavailable").replaceAll("_", " ")}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p>
          Change = current report minus the preceding retained trading report for the same participant.
          Client is the exchange-reported client class; it is not asserted to be retail-only.
        </p>
        <details open>
          <summary>Yesterday comparison · detailed call/put calculations</summary>
          <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Detailed participant option calculations scroll area">
            <table aria-label="Detailed participant call and put calculations" data-testid="morning-participant-calculation-table">
              <thead>
                <tr>
                  <th>Participant</th><th>Report</th>
                  <th>Call long</th><th>Call short</th><th>Net calls = long − short</th>
                  <th>Put long</th><th>Put short</th><th>Net puts = long − short</th>
                  <th>Options proxy = net calls − net puts</th>
                </tr>
              </thead>
              <tbody>
                {participantOrder.flatMap((type) => {
                  const row = participantRows.get(type);
                  return ([
                    ["Previous", "previous_option_index_call_long", "previous_option_index_call_short", "previous_net_calls", "previous_option_index_put_long", "previous_option_index_put_short", "previous_net_puts", "previous_options_proxy"],
                    ["Current", "option_index_call_long", "option_index_call_short", "net_calls", "option_index_put_long", "option_index_put_short", "net_puts", "options_proxy"],
                  ] as const).map(([report, callLong, callShort, netCalls, putLong, putShort, netPuts, proxy]) => (
                    <tr key={`${type}-${report}`}>
                      <th>{participantLabel(type)}</th><th>{report}</th>
                      <td>{value(row?.[callLong])}</td><td>{value(row?.[callShort])}</td><td {...participantHeatCell(row?.[netCalls], netCalls)}>{value(row?.[netCalls])}</td>
                      <td>{value(row?.[putLong])}</td><td>{value(row?.[putShort])}</td><td {...participantHeatCell(row?.[netPuts], netPuts)}>{value(row?.[netPuts])}</td>
                      <td {...participantHeatCell(row?.[proxy], proxy)}>{value(row?.[proxy])}</td>
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          </div>
          <p>
            Net calls = index-call long contracts − index-call short contracts. Net puts = index-put long contracts − index-put short contracts. Options proxy = net calls − net puts. These are outstanding participant contracts, not premium cash flow or a trade recommendation.
          </p>
        </details>
      </section>
      <section>
        <h2>Original six-row market matrix</h2>
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
        <h2>Morning interpretation</h2>
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
