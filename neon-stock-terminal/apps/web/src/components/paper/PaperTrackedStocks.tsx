import { useEffect, useMemo, useState } from "react";
import { StockLogo } from "../stocks/StockProfileControls";
import {
  AI_PROVIDER_ORDER,
  filterTrackedStocks,
  trackedStocksCsv,
  type AiProviderName,
  type AiTrackedProviderResult,
  type AiTrackedStock,
  type AiTrackedStocksPayload,
} from "../../lib/paperTrackedStocks";
import styles from "./PaperTrackedStocks.module.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

const value = (input: number | null, options?: Intl.NumberFormatOptions) =>
  input == null ? "—" : new Intl.NumberFormat("en-IN", options).format(input);

const todayInIndia = () => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (name: string) => parts.find((item) => item.type === name)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
};

function ProviderCell({ provider, result }: { provider: AiProviderName; result?: AiTrackedProviderResult }) {
  if (!result) return <div className={styles.providerCell} data-status="MISSING"><strong>{provider}</strong><span>—</span><small>Not queued</small></div>;
  return (
    <div className={styles.providerCell} data-status={result.status}>
      <strong>{provider}</strong>
      <span>{result.verdict?.replaceAll("_", " ") ?? result.status}</span>
      <small>
        {result.confidence == null ? "Confidence —" : `${result.confidence}%`}
        {result.newsSignal ? ` · ${result.newsSignal}` : ""}
      </small>
      <p>{result.summary ?? (result.status === "DEAD" ? `Unavailable · ${result.errorClass ?? "provider response failed"}` : "Evaluation in progress")}</p>
      <em>{result.deliveryStatus ? `WhatsApp ${result.deliveryStatus}` : result.status === "SUCCEEDED" ? "Delivery disabled/pending" : "No message sent"}</em>
    </div>
  );
}

function TrackedStockInspector({ stock, onClose }: { stock: AiTrackedStock; onClose: () => void }) {
  const history = stock.inputSnapshot.history_30d ?? [];
  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);
  return (
    <aside className={styles.inspector} role="dialog" aria-label={`${stock.symbol} AI research detail`}>
      <header>
        <StockLogo symbol={stock.symbol} size={30} />
        <div><strong>{stock.symbol}</strong><span>{stock.companyName ?? "Company name unavailable"}</span></div>
        <button type="button" onClick={onClose} aria-label="Close tracked stock detail">×</button>
      </header>
      <section className={styles.inputSummary}>
        <h3>Strategy input</h3>
        <dl>
          <div><dt>Source</dt><dd>{stock.sources.map((source) => source.strategy).filter(Boolean).join(" + ") || "—"}</dd></div>
          <div><dt>Direction</dt><dd>{stock.direction ?? "—"}</dd></div>
          <div><dt>Status</dt><dd>{stock.strategyStatus ?? "—"}</dd></div>
          <div><dt>O / X</dt><dd>{value(stock.ofactor, { maximumFractionDigits: 2 })} / {value(stock.xfactor, { maximumFractionDigits: 2 })}</dd></div>
          <div><dt>Reference</dt><dd>{stock.referencePrice == null ? "—" : `₹${value(stock.referencePrice, { maximumFractionDigits: 2 })}`}</dd></div>
          <div><dt>Bars</dt><dd>{stock.historySessionCount} through {stock.sourceDataThrough ?? "—"}</dd></div>
        </dl>
      </section>
      {AI_PROVIDER_ORDER.map((provider) => {
        const result = stock.providers[provider];
        return <section key={provider} className={styles.providerDetail}>
          <h3>{provider}</h3>
          {result ? <>
            <b>{result.verdict?.replaceAll("_", " ") ?? result.status} · {result.confidence ?? "—"}% · {result.newsSignal ?? "—"}</b>
            <p>{result.summary ?? "No validated conclusion."}</p>
            <dl>
              <div><dt>Driver</dt><dd>{result.keyDriver ?? "—"}</dd></div>
              <div><dt>Risk</dt><dd>{result.keyRisk ?? "—"}</dd></div>
              <div><dt>Entry view</dt><dd>{result.entryView ?? "—"}</dd></div>
              <div><dt>Invalidation</dt><dd>{result.invalidation ?? "—"}</dd></div>
            </dl>
            {result.evidence.length ? <ul>{result.evidence.map((item, index) => {
              const safeUrl = item.url?.startsWith("https://") || item.url?.startsWith("http://") ? item.url : undefined;
              return <li key={`${item.url ?? item.headline}-${index}`}>
                {safeUrl ? <a href={safeUrl} target="_blank" rel="noreferrer">{item.headline || item.publisher || "Source"}</a> : <span>{item.headline || item.publisher || "Source unavailable"}</span>}
                <small>{[item.publisher, item.date].filter(Boolean).join(" · ")}</small>
              </li>;
            })}</ul> : null}
          </> : <p>Provider was not queued for this evaluation.</p>}
        </section>;
      })}
      <section className={styles.historySection}>
        <h3>Immutable daily OHLCV input · {history.length} sessions</h3>
        <div><table><thead><tr><th>Date</th><th>Open</th><th>High</th><th>Low</th><th>Close</th><th>Volume</th></tr></thead>
          <tbody>{history.map((bar, index) => <tr key={String(bar.date ?? index)}>
            <td>{String(bar.date ?? "—")}</td>
            {(["open", "high", "low", "close", "volume"] as const).map((field) => <td key={field}>{bar[field] == null ? "—" : value(Number(bar[field]), { maximumFractionDigits: field === "volume" ? 0 : 2 })}</td>)}
          </tr>)}</tbody></table></div>
      </section>
    </aside>
  );
}

export function PaperTrackedStocks() {
  const [date, setDate] = useState(todayInIndia);
  const [payload, setPayload] = useState<AiTrackedStocksPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<AiTrackedStock | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`${API_BASE_URL}/v1/workspace/paper-trading/tracked-stocks?date=${encodeURIComponent(date)}`, {
      credentials: "include",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    }).then(async (response) => {
      if (!response.ok) throw new Error(`Tracked-stock API ${response.status}`);
      return response.json() as Promise<AiTrackedStocksPayload>;
    }).then(setPayload).catch((reason) => {
      if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(reason instanceof Error ? reason.message : String(reason));
    }).finally(() => setLoading(false));
    return () => controller.abort();
  }, [date, refreshKey]);

  const visible = useMemo(() => filterTrackedStocks(payload?.stocks ?? [], search), [payload?.stocks, search]);
  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([trackedStocksCsv(visible)], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `ai-stocks-tracked-${payload?.effectiveDate ?? date}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return <section className={styles.panel} aria-labelledby="tracked-stocks-title">
    <header className={styles.toolbar}>
      <div><span>OIIS / OISS RESEARCH</span><h2 id="tracked-stocks-title">Stocks being tracked today</h2><p>One row per stock/day. Model research is evidence only and does not create a paper order.</p></div>
      <label>Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
      <label>Search<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Stock, source or AI view" /></label>
      <button type="button" onClick={() => setRefreshKey((key) => key + 1)}>Refresh</button>
      <button type="button" onClick={exportCsv} disabled={!visible.length}>Export CSV</button>
    </header>
    {payload?.usedLatestSession ? <div className={styles.sessionNotice}>No evaluations exist for {payload.requestedDate}; showing latest tracked session {payload.effectiveDate}.</div> : null}
    {loading && !payload ? <div className={styles.state}>Loading tracked stocks…</div> : error ? <div className={styles.state} data-error="true"><strong>Tracked-stock evidence unavailable</strong><span>{error}</span><button type="button" onClick={() => setRefreshKey((key) => key + 1)}>Retry</button></div> : !visible.length ? <div className={styles.state}><strong>No stocks tracked for this session</strong><span>The next completed OIIS/OISS selection will appear automatically. Missing data is not shown as zero.</span></div> : <>
      <div className={styles.countRow}><strong>{visible.length} stocks</strong><span>Evaluated {payload?.asOf ? new Date(payload.asOf).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "—"}</span></div>
      <div className={styles.tableViewport}><table className={styles.table}>
        <thead><tr><th>Stock</th><th>Source / strategy</th><th>O / X / reference</th><th>30D input</th>{AI_PROVIDER_ORDER.map((provider) => <th key={provider}>{provider}</th>)}<th>Audit</th></tr></thead>
        <tbody>{visible.map((stock) => {
          const latest = stock.inputSnapshot.history_30d?.at(-1);
          return <tr key={stock.evaluationId}>
            <td><div className={styles.identity}><StockLogo symbol={stock.symbol} size={24} /><div><strong>{stock.symbol}</strong><span>{stock.companyName ?? "—"}</span><small>{stock.evaluationStatus}</small></div></div></td>
            <td><strong>{stock.sources.map((source) => source.strategy).filter(Boolean).join(" + ") || "—"}</strong><span>{stock.direction ?? "—"} · {stock.strategyStatus ?? "—"}</span><small>{stock.sources.map((source) => source.slot).filter(Boolean).join(", ") || "—"}</small></td>
            <td className={styles.numeric}><strong>O {value(stock.ofactor, { maximumFractionDigits: 2 })} · X {value(stock.xfactor, { maximumFractionDigits: 2 })}</strong><span>{stock.referencePrice == null ? "₹—" : `₹${value(stock.referencePrice, { maximumFractionDigits: 2 })}`}</span><small>Decision input</small></td>
            <td className={styles.numeric}><strong>{stock.historySessionCount} sessions</strong><span>Close {latest?.close == null ? "—" : value(Number(latest.close), { maximumFractionDigits: 2 })}</span><small>Vol {latest?.volume == null ? "—" : value(Number(latest.volume), { maximumFractionDigits: 0 })} · through {stock.sourceDataThrough ?? "—"}</small></td>
            {AI_PROVIDER_ORDER.map((provider) => <td key={provider}><ProviderCell provider={provider} result={stock.providers[provider]} /></td>)}
            <td><button className={styles.inspectButton} type="button" onClick={() => setSelected(stock)}>View details</button></td>
          </tr>;
        })}</tbody>
      </table></div>
    </>}
    {selected ? <TrackedStockInspector stock={selected} onClose={() => setSelected(null)} /> : null}
  </section>;
}
