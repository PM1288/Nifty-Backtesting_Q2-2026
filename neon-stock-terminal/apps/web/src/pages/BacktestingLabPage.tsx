import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { DataTable, ErrorState, KpiCard, LoadingTableCard } from "../components/ui/DashboardPrimitives";
import { useAuthGate } from "../auth/AuthGateProvider";
import {
  cancelBacktestingLabRun,
  createBacktestingLabRun,
  fetchBacktestingLabCatalogue,
  fetchBacktestingLabEquity,
  fetchBacktestingLabLadders,
  fetchBacktestingLabRun,
  fetchBacktestingLabRuns,
  fetchBacktestingLabTrades,
  getBacktestingLabCsvUrl,
  type BacktestingLabRun
} from "../lib/api";
import { formatCurrencyINR, formatDateIST, formatNumber, formatPercent } from "../lib/format";
import { BacktestingHeader, BacktestingLineChart } from "./BacktestingChrome";
import analyticsStyles from "./AnalyticsPage.module.css";
import styles from "./BacktestingLabPage.module.css";

function runId(run: BacktestingLabRun | undefined) {
  return run?.runId ?? run?.run_id ?? "";
}

function numeric(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function statusTone(status: string) {
  if (status === "COMPLETED") return "good";
  if (status.includes("FAIL")) return "bad";
  if (status.includes("CANCEL")) return "muted";
  return "running";
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

type ResultTab = "overview" | "ladders" | "trades" | "inputs";

export function BacktestingLabPage() {
  const { authReady } = useAuthGate();
  const queryClient = useQueryClient();
  const catalogue = useQuery({ queryKey: ["backtesting-lab-catalogue"], queryFn: fetchBacktestingLabCatalogue, enabled: authReady });
  const runs = useQuery({
    queryKey: ["backtesting-lab-runs"], queryFn: fetchBacktestingLabRuns, enabled: authReady,
    refetchInterval: (query) => query.state.data?.items.some((item) => ["QUEUED", "RUNNING", "VALIDATING", "CANCEL_REQUESTED"].includes(item.status)) ? 4_000 : false
  });
  const [selectedStrategy, setSelectedStrategy] = useState("");
  const [selectedBatch, setSelectedBatch] = useState(0);
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [universe, setUniverse] = useState<"single_stock" | "nifty_100">("single_stock");
  const [symbol, setSymbol] = useState("RELIANCE");
  const [capitalMode, setCapitalMode] = useState<"no_capital_limit" | "capital_16l" | "capital_10l">("no_capital_limit");
  const [parameters, setParameters] = useState<Record<string, number | boolean>>({});
  const [selectedRunId, setSelectedRunId] = useState("");
  const [resultTab, setResultTab] = useState<ResultTab>("overview");

  useEffect(() => {
    if (!catalogue.data || selectedStrategy) return;
    const strategy = catalogue.data.strategies[0];
    const batch = catalogue.data.sourceBatches[0];
    if (!strategy || !batch) return;
    setSelectedStrategy(strategy.strategyVersionId);
    setSelectedBatch(batch.batchRunId);
    setDateStart(batch.dateStart);
    setDateEnd(batch.dateEnd);
    setParameters(Object.fromEntries(Object.entries(strategy.parameters).map(([key, spec]) => [key, spec.default])));
  }, [catalogue.data, selectedStrategy]);

  useEffect(() => {
    if (selectedRunId || !runs.data?.items.length) return;
    setSelectedRunId(runId(runs.data.items[0]));
  }, [runs.data, selectedRunId]);

  const strategy = catalogue.data?.strategies.find((item) => item.strategyVersionId === selectedStrategy);
  const selectedRun = useQuery({ queryKey: ["backtesting-lab-run", selectedRunId], queryFn: () => fetchBacktestingLabRun(selectedRunId), enabled: !!selectedRunId, refetchInterval: (query) => ["QUEUED", "RUNNING", "VALIDATING", "CANCEL_REQUESTED"].includes(query.state.data?.status ?? "") ? 4_000 : false });
  const completed = selectedRun.data?.status === "COMPLETED";
  const trades = useQuery({ queryKey: ["backtesting-lab-trades", selectedRunId], queryFn: () => fetchBacktestingLabTrades(selectedRunId), enabled: !!selectedRunId && completed });
  const ladders = useQuery({ queryKey: ["backtesting-lab-ladders", selectedRunId], queryFn: () => fetchBacktestingLabLadders(selectedRunId), enabled: !!selectedRunId && completed });
  const equity = useQuery({ queryKey: ["backtesting-lab-equity", selectedRunId], queryFn: () => fetchBacktestingLabEquity(selectedRunId), enabled: !!selectedRunId && completed });
  const capital = useMemo(() => capitalMode === "capital_16l"
    ? { mode: capitalMode, startingCapital: 1_600_000, ticketSize: 200_000, maxPositions: 8 }
    : capitalMode === "capital_10l"
      ? { mode: capitalMode, startingCapital: 1_000_000, ticketSize: 100_000, maxPositions: 10 }
      : { mode: capitalMode, startingCapital: null, ticketSize: null, maxPositions: null }, [capitalMode]);

  const createRun = useMutation({
    mutationFn: async () => {
      return createBacktestingLabRun({
        schemaVersion: "1.0", strategyVersionId: selectedStrategy, sourceBatchRunId: selectedBatch,
        dateStart, dateEnd, universe: { mode: universe, symbols: universe === "single_stock" ? [symbol.toUpperCase()] : [] },
        parameters, capital
      }, crypto.randomUUID());
    },
    onSuccess: async (result) => {
      setSelectedRunId(runId(result));
      await queryClient.invalidateQueries({ queryKey: ["backtesting-lab-runs"] });
    }
  });

  const cancelRun = useMutation({
    mutationFn: cancelBacktestingLabRun,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["backtesting-lab-runs"] }),
        queryClient.invalidateQueries({ queryKey: ["backtesting-lab-run", selectedRunId] })
      ]);
    }
  });

  const equityPoints = useMemo(() => (equity.data?.items ?? []).map((row) => ({
    date: String(row.tradeDate), strategyValue: numeric(row.netLiquidationEquity), benchmarkValue: null,
    drawdownPct: numeric(row.drawdownPct), deployedCapital: numeric(row.deployedCapital), openPositions: numeric(row.openPositions)
  })), [equity.data]);

  const resultMatchesDraft = useMemo(() => {
    const run = selectedRun.data;
    if (!run) return false;
    return (run.strategyVersionId ?? run.strategy_version_id) === selectedStrategy
      && Number(run.sourceBatchRunId ?? run.source_batch_run_id ?? 0) === selectedBatch
      && String(run.requestedDateStart ?? run.requested_date_start ?? "").slice(0, 10) === dateStart
      && String(run.requestedDateEnd ?? run.requested_date_end ?? "").slice(0, 10) === dateEnd
      && (run.universeMode ?? "single_stock") === universe
      && canonicalJson(run.symbols ?? []) === canonicalJson(universe === "single_stock" ? [symbol.toUpperCase()] : [])
      && canonicalJson(run.parameters ?? {}) === canonicalJson(parameters)
      && canonicalJson(run.capital ?? {}) === canonicalJson(capital);
  }, [capital, dateEnd, dateStart, parameters, selectedBatch, selectedRun.data, selectedStrategy, symbol, universe]);

  const restoreRunInputs = () => {
    const run = selectedRun.data;
    if (!run) return;
    setSelectedStrategy(run.strategyVersionId ?? run.strategy_version_id ?? selectedStrategy);
    setSelectedBatch(Number(run.sourceBatchRunId ?? run.source_batch_run_id ?? selectedBatch));
    setDateStart(String(run.requestedDateStart ?? run.requested_date_start ?? dateStart).slice(0, 10));
    setDateEnd(String(run.requestedDateEnd ?? run.requested_date_end ?? dateEnd).slice(0, 10));
    const nextUniverse = run.universeMode === "nifty_100" ? "nifty_100" : "single_stock";
    setUniverse(nextUniverse);
    if (nextUniverse === "single_stock" && run.symbols?.[0]) setSymbol(String(run.symbols[0]));
    setParameters(run.parameters ?? {});
    const nextCapitalMode = run.capital?.mode;
    if (["no_capital_limit", "capital_16l", "capital_10l"].includes(String(nextCapitalMode))) {
      setCapitalMode(nextCapitalMode as typeof capitalMode);
    }
  };

  if (!authReady || catalogue.isLoading || runs.isLoading) return <LoadingTableCard title="Strategy Testing Lab" rows={7} />;
  if (catalogue.error || !catalogue.data) return <ErrorState title="Testing lab is unavailable" body="The governed strategy catalogue or source-batch metadata could not be loaded." />;

  const summary = selectedRun.data?.summary ?? {};
  const isPortfolio = summary.portfolioReturnEstimable === true;
  const mutationError = createRun.error instanceof Error ? createRun.error.message : cancelRun.error instanceof Error ? cancelRun.error.message : null;

  return (
    <div className={`${analyticsStyles.page} ${analyticsStyles.backtestingPage} ${styles.lab}`}>
      <BacktestingHeader
        title="Test Strategy"
        subtitle="Change only governed levels, queue a bounded historical replay, and compare execution economics with every diagnostic ladder level. This workspace has no broker authority."
        meta={`${catalogue.data.environment} • ${catalogue.data.engineVersion}`}
      />

      <nav className={styles.workflowRail} aria-label="Research to paper workflow">
        <Link to="/analytics" data-state="complete"><span>1</span><strong>Explore</strong><small>Market evidence</small></Link>
        <Link to="/analytics/indicators" data-state="complete"><span>2</span><strong>Research</strong><small>Entry hypothesis</small></Link>
        <Link to="/backtesting/lab" aria-current="step" data-state="active"><span>3</span><strong>Backtest</strong><small>Current workspace</small></Link>
        <Link to="/backtesting/compare" data-state="next"><span>4</span><strong>Compare</strong><small>Robustness</small></Link>
        <Link to="/paper-trading" data-state="next"><span>5</span><strong>Paper</strong><small>Observed execution</small></Link>
      </nav>

      <section className={styles.safetyBanner}>
        <strong>RESEARCH ONLY</strong>
        <span>Daily OHLC cannot prove intrabar ordering. Same-bar target/adverse crossings are marked ambiguous, and diagnostic targets never change the strategy exit.</span>
      </section>

      <section className={styles.builderGrid}>
        <article className={styles.builderCard}>
          <div className={styles.stepLabel}>01 · Define</div>
          <label>Strategy version
            <select value={selectedStrategy} onChange={(event) => {
              const next = catalogue.data.strategies.find((item) => item.strategyVersionId === event.target.value);
              setSelectedStrategy(event.target.value);
              if (next) setParameters(Object.fromEntries(Object.entries(next.parameters).map(([key, spec]) => [key, spec.default])));
            }}>
              {catalogue.data.strategies.map((item) => <option key={item.strategyVersionId} value={item.strategyVersionId}>{item.displayName}</option>)}
            </select>
          </label>
          <p>{strategy?.plainEnglish}</p>
          <div className={styles.parameterGrid}>
            {strategy ? Object.entries(strategy.parameters).map(([key, spec]) => (
              <label key={key}>{spec.label}
                {spec.type === "boolean" ? (
                  <input type="checkbox" checked={Boolean(parameters[key])} onChange={(event) => setParameters((old) => ({ ...old, [key]: event.target.checked }))} />
                ) : (
                  <input type="number" min={spec.minimum} max={spec.maximum} step={spec.step} value={Number(parameters[key] ?? spec.default)} onChange={(event) => setParameters((old) => ({ ...old, [key]: Number(event.target.value) }))} />
                )}
              </label>
            )) : null}
          </div>
        </article>

        <article className={styles.builderCard}>
          <div className={styles.stepLabel}>02 · Scope</div>
          <label>Qualified source batch
            <select value={selectedBatch} onChange={(event) => {
              const id = Number(event.target.value); const batch = catalogue.data.sourceBatches.find((item) => item.batchRunId === id);
              setSelectedBatch(id); if (batch) { setDateStart(batch.dateStart); setDateEnd(batch.dateEnd); }
            }}>
              {catalogue.data.sourceBatches.map((batch) => <option key={batch.batchRunId} value={batch.batchRunId}>#{batch.batchRunId} · through {formatDateIST(batch.dateEnd)} · {batch.symbolCount} stocks</option>)}
            </select>
          </label>
          <div className={styles.twoColumns}>
            <label>Signal start<input type="date" value={dateStart} onChange={(event) => setDateStart(event.target.value)} /></label>
            <label>Signal end<input type="date" value={dateEnd} onChange={(event) => setDateEnd(event.target.value)} /></label>
          </div>
          <div className={styles.twoColumns}>
            <label>Universe<select value={universe} onChange={(event) => setUniverse(event.target.value as typeof universe)}><option value="single_stock">One stock</option><option value="nifty_100">Nifty 100 panel</option></select></label>
            <label>Stock<input value={symbol} disabled={universe !== "single_stock"} onChange={(event) => setSymbol(event.target.value.toUpperCase())} /></label>
          </div>
          <label>Capital view<select value={capitalMode} onChange={(event) => setCapitalMode(event.target.value as typeof capitalMode)}><option value="no_capital_limit">Unconstrained opportunity</option><option value="capital_16l">₹16L · ₹2L ticket · max 8</option><option value="capital_10l">₹10L · ₹1L ticket · max 10</option></select></label>
        </article>

        <article className={`${styles.builderCard} ${styles.verifyCard}`}>
          <div className={styles.stepLabel}>03 · Verify & Run</div>
          <dl>
            <div><dt>Entry timing</dt><dd>Signal T close; enter T+1 open</dd></div>
            <div><dt>Execution exit</dt><dd>{strategy?.authoritativeExit}</dd></div>
            <div><dt>Independent evidence</dt><dd>I030/I050/I070 · D+5 1/2/5% · adverse · H30</dd></div>
            <div><dt>Tax scenario</dt><dd>35% reserve on positive realised net profit</dd></div>
          </dl>
          <button className={styles.primaryButton} disabled={createRun.isPending || !selectedStrategy || !dateStart || !dateEnd || (universe === "single_stock" && !symbol)} onClick={() => createRun.mutate()}>
            {createRun.isPending ? "Queuing…" : "Queue research run"}
          </button>
          {mutationError ? <p className={styles.inlineError}>{mutationError.includes("401") ? "Sign in is required to create or cancel runs. Viewer mode remains available without the login popup." : mutationError}</p> : null}
        </article>
      </section>

      <section className={styles.runStrip}>
        <div><span>Selected run</span><strong>{selectedRunId || "No run selected"}</strong></div>
        <div><span>Status</span><strong data-tone={statusTone(selectedRun.data?.status ?? "NONE")}>{selectedRun.data?.status ?? "—"}</strong></div>
        <div><span>Result vs inputs</span><strong data-tone={resultMatchesDraft ? "good" : "bad"}>{selectedRun.data ? resultMatchesDraft ? "CURRENT" : "STALE" : "NO RESULT"}</strong></div>
        <div><span>Progress</span><strong>{numeric(selectedRun.data?.completedWorkUnits)} / {numeric(selectedRun.data?.totalWorkUnits)}</strong></div>
        <div><span>Tested</span><strong>{selectedRun.data?.finishedAt ? formatDateIST(selectedRun.data.finishedAt, { includeTime: true }) : "Pending"}</strong></div>
        {selectedRun.data && !resultMatchesDraft ? <button onClick={restoreRunInputs}>Restore inputs</button> : null}
        {["QUEUED", "RUNNING"].includes(selectedRun.data?.status ?? "") ? <button onClick={() => cancelRun.mutate(selectedRunId)}>Cancel</button> : null}
      </section>

      <section className={styles.historyPanel}>
        <h2>Recent experiments</h2>
        <div className={styles.runChips}>
          {(runs.data?.items ?? []).map((item) => <button key={runId(item)} data-active={runId(item) === selectedRunId} onClick={() => setSelectedRunId(runId(item))}><strong>{item.status}</strong><span>{(item.strategyVersionId ?? item.strategy_version_id ?? "strategy").split("_").slice(0, 3).join(" ")}</span><small>{formatDateIST(item.createdAt ?? item.created_at ?? "")}</small></button>)}
        </div>
      </section>

      {selectedRun.data?.status === "FAILED" ? <ErrorState title="Run failed" body={selectedRun.data.errorDetail ?? selectedRun.data.error_detail ?? "The worker recorded a classified failure. The prior evidence was retained."} /> : null}

      {completed ? <>
        <div className={styles.resultToolbar}>
          <div className={styles.resultTabs} role="tablist" aria-label="Backtest result views">
            {(["overview", "ladders", "trades", "inputs"] as ResultTab[]).map((tab) => (
              <button key={tab} type="button" role="tab" aria-selected={resultTab === tab} data-active={resultTab === tab ? "true" : "false"} onClick={() => setResultTab(tab)}>
                {tab === "inputs" ? "Inputs & audit" : tab[0].toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
          <div className={styles.resultActions}>
            <a href={getBacktestingLabCsvUrl(selectedRunId)} download>Download consolidated trades CSV</a>
          </div>
        </div>

        {resultTab === "overview" ? <>
          <section className={styles.kpiGrid}>
            <KpiCard label="Signals" value={formatNumber(numeric(summary.signalCount), { maximumFractionDigits: 0 })} />
            <KpiCard label="Accepted trades" value={formatNumber(numeric(summary.acceptedTradeCount), { maximumFractionDigits: 0 })} />
            <KpiCard label={isPortfolio ? "After-tax realised" : "Unit P&L after-tax"} value={formatCurrencyINR(numeric(summary.afterTaxRealizedPnl), true)} tone={numeric(summary.afterTaxRealizedPnl) >= 0 ? "green" : "red"} />
            <KpiCard label="Open liability" value={formatCurrencyINR(numeric(summary.unrealizedPnl), true)} tone={numeric(summary.unrealizedPnl) >= 0 ? "green" : "red"} />
            <KpiCard label={isPortfolio ? "Net portfolio return" : "Opportunity index return"} value={formatPercent(numeric(summary.totalReturnPct), 2, true)} />
            <KpiCard label="Max drawdown" value={formatPercent(numeric(summary.maxDrawdownPct), 2, true)} tone="red" />
          </section>
          {equityPoints.length ? <article className={`${analyticsStyles.chartPanel} ${styles.chartCard}`}><h2>Net-liquidation journey</h2><p>Actual execution replay only. Alternative target-track outcomes are not added together.</p><BacktestingLineChart points={equityPoints} /></article> : null}
        </> : null}

        {resultTab === "ladders" ? <DataTable title="Independent ladder evidence" subtitle="Every reward and adverse level is evaluated independently; a first hit never stops the remaining diagnostic tracks." rows={ladders.data?.items ?? []} maxHeight={520} columns={[
          { key: "kind", header: "Track", cell: (row) => String(row.ladderKind) },
          { key: "level", header: "Level", cell: (row) => String(row.levelKey) },
          { key: "sample", header: "Trades", align: "right", cell: (row) => formatNumber(numeric(row.sampleCount), { maximumFractionDigits: 0 }) },
          { key: "hits", header: "Hits", align: "right", cell: (row) => formatNumber(numeric(row.hitCount), { maximumFractionDigits: 0 }) },
          { key: "rate", header: "Hit rate", align: "right", cell: (row) => formatPercent(numeric(row.hitRatePct), 2, true) }
        ]} /> : null}

        {resultTab === "trades" ? <DataTable title="Consolidated trade evidence" subtitle="Execution outcomes and opportunity-path diagnostics remain separate in each row." rows={trades.data?.items ?? []} maxHeight={620} columns={[
          { key: "symbol", header: "Stock", sortable: true, sortValue: (row) => row.symbol, cell: (row) => row.symbol },
          { key: "signal", header: "Signal", sortable: true, sortValue: (row) => row.signal_date, cell: (row) => formatDateIST(row.signal_date) },
          { key: "entry", header: "Entry", cell: (row) => `${formatDateIST(row.entry_date)} · ${formatCurrencyINR(numeric(row.entry_price), false)}` },
          { key: "status", header: "Execution", cell: (row) => row.execution_status },
          { key: "rsi", header: "RSI 14", align: "right", sortable: true, sortValue: (row) => numeric(row.signal_rsi), cell: (row) => formatNumber(numeric(row.signal_rsi), { maximumFractionDigits: 2 }) },
          { key: "willr", header: "Williams %R", align: "right", cell: (row) => formatNumber(numeric(row.signal_willr), { maximumFractionDigits: 2 }) },
          { key: "macd", header: "MACD", align: "right", cell: (row) => formatNumber(numeric(row.signal_macd_line), { maximumFractionDigits: 2 }) },
          { key: "pnl", header: "Net-liquidation P&L", align: "right", sortable: true, sortValue: (row) => numeric(row.net_liquidation_pnl), cell: (row) => formatCurrencyINR(numeric(row.net_liquidation_pnl), true) },
          { key: "mfe", header: "H30 max upside", align: "right", cell: (row) => formatPercent(numeric(row.maximum_favourable_excursion_pct), 2, true) },
          { key: "mae", header: "H30 max adverse", align: "right", cell: (row) => formatPercent(numeric(row.maximum_adverse_excursion_pct), 2, true) },
          { key: "stockRegime", header: "Stock regime", cell: (row) => row.stock_regime ?? "UNKNOWN" },
          { key: "niftyRegime", header: "Nifty regime", cell: (row) => row.nifty_regime ?? "UNKNOWN" },
          { key: "vix", header: "VIX", cell: (row) => row.india_vix_regime ?? "UNKNOWN" }
        ]} /> : null}

        {resultTab === "inputs" ? <section className={styles.auditGrid}>
          <article className={styles.provenanceCard}>
            <header><div><span>Immutable evidence</span><h2>Run inputs and provenance</h2></div><strong data-tone={selectedRun.data?.validationStatus === "PASSED" ? "good" : "neutral"}>{selectedRun.data?.validationStatus ?? "NOT RECORDED"}</strong></header>
            <dl>
              <div><dt>Run ID</dt><dd>{selectedRunId}</dd></div>
              <div><dt>Strategy version</dt><dd>{selectedRun.data?.strategyVersionId ?? selectedRun.data?.strategy_version_id ?? "—"}</dd></div>
              <div><dt>Engine</dt><dd>{catalogue.data.engineVersion}</dd></div>
              <div><dt>Evaluation policy</dt><dd>{catalogue.data.evaluationPolicyVersion}</dd></div>
              <div><dt>Source batch</dt><dd>#{selectedRun.data?.sourceBatchRunId ?? selectedRun.data?.source_batch_run_id ?? "—"}</dd></div>
              <div><dt>Requested coverage</dt><dd>{formatDateIST(selectedRun.data?.requestedDateStart ?? selectedRun.data?.requested_date_start ?? "")} — {formatDateIST(selectedRun.data?.requestedDateEnd ?? selectedRun.data?.requested_date_end ?? "")}</dd></div>
              <div><dt>Actual coverage</dt><dd>{selectedRun.data?.actualDateStart ? formatDateIST(selectedRun.data.actualDateStart) : "Not recorded"} — {selectedRun.data?.actualDateEnd ? formatDateIST(selectedRun.data.actualDateEnd) : "Not recorded"}</dd></div>
              <div><dt>Universe</dt><dd>{selectedRun.data?.universeMode ?? "—"} {selectedRun.data?.symbols?.length ? `· ${selectedRun.data.symbols.join(", ")}` : ""}</dd></div>
              <div><dt>Capital mode</dt><dd>{String(selectedRun.data?.capital?.mode ?? "—")}</dd></div>
              <div><dt>Result hash</dt><dd>{selectedRun.data?.resultHash ?? "Not recorded"}</dd></div>
            </dl>
          </article>
          <article className={styles.provenanceCard}>
            <header><div><span>Configuration</span><h2>Parameters used</h2></div></header>
            <dl>{Object.entries(selectedRun.data?.parameters ?? {}).map(([key, value]) => <div key={key}><dt>{key.replaceAll("_", " ")}</dt><dd>{String(value)}</dd></div>)}</dl>
          </article>
          <div className={styles.eventsTable}>
            <DataTable title="Run event history" rows={selectedRun.data?.events ?? []} maxHeight={440} columns={[
              { key: "time", header: "Time", cell: (row) => formatDateIST(String(row.created_at ?? ""), { includeTime: true }) },
              { key: "event", header: "Event", cell: (row) => String(row.event_type ?? "—") },
              { key: "before", header: "Before", cell: (row) => String(row.status_before ?? "—") },
              { key: "after", header: "After", cell: (row) => String(row.status_after ?? "—") }
            ]} />
          </div>
        </section> : null}
      </> : null}
    </div>
  );
}
