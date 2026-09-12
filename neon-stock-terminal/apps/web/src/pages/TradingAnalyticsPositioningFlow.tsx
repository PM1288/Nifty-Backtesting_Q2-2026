import { lazy, Suspense, useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import { ParticipantOptionsHistoryChart } from "./ParticipantOptionsHistoryChart";
import {
  buildParticipantForwardEvaluation,
  buildStrikeFlowRows,
  fiiProAlignment,
  finite,
  participantPositionState,
  positioningMetrics,
  summarizeStrikeFlow,
  type EvidenceRow,
  type PositioningMetric,
} from "../lib/positioningFlow";
import { buildProbableZones, extractStructuralLevels, LEVEL_WEIGHTS, type ProbableZone } from "../lib/positioningFlowLevels";
import css from "./TradingAnalyticsPositioningFlow.module.css";

const Chart = lazy(async () => ({ default: (await import("../components/visual/EChartSurface")).EChartSurface }));
const participantOrder = ["FII", "Pro", "Client", "DII"];
const participantColours: Record<string, string> = { FII: "#2563eb", Pro: "#7c3aed", Client: "#c46a08", DII: "#0f766e" };
type Tab = "overview" | "market" | "levels" | "history" | "evaluation" | "coverage";
type PositioningCoverage = { generatedAt: string; scope: string; requestedPilotSessions: number; families: EvidenceRow[]; limitations: string[] };
type ParticipantHistory = {
  rows: EvidenceRow[]; reportCount: number; oldestDate: string | null;
  latestDate: string | null; state: string; scope: string; unit: string; limit: number;
};

const participantLabel = (name: unknown) => name === "Client" ? "Client (reported)" : String(name ?? "Unavailable");
const signedClass = (value: unknown) => finite(value) == null ? css.missing : finite(value)! > 0 ? css.positive : finite(value)! < 0 ? css.negative : css.neutral;
const compact = (candidate: unknown) => {
  const value = finite(candidate);
  if (value == null) return "—";
  const absolute = Math.abs(value);
  const sign = value > 0 ? "+" : "";
  if (absolute >= 10_000_000) return `${sign}${(value / 10_000_000).toFixed(2)}Cr`;
  if (absolute >= 100_000) return `${sign}${(value / 100_000).toFixed(2)}L`;
  if (absolute >= 1_000) return `${sign}${(value / 1_000).toFixed(1)}K`;
  return `${sign}${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
};
const compactUnsigned = (candidate: unknown) => {
  const value = finite(candidate);
  if (value == null) return "—";
  const absolute = Math.abs(value);
  if (absolute >= 10_000_000) return `${(value / 10_000_000).toFixed(2)}Cr`;
  if (absolute >= 100_000) return `${(value / 100_000).toFixed(2)}L`;
  if (absolute >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
};
const number = (candidate: unknown, digits = 2) => finite(candidate)?.toLocaleString("en-IN", { maximumFractionDigits: digits }) ?? "—";
const percent = (candidate: unknown) => finite(candidate) == null ? "—" : `${finite(candidate)! > 0 ? "+" : ""}${finite(candidate)!.toFixed(2)}%`;

function download(name: string, body: string, type: string) {
  const href = URL.createObjectURL(new Blob([body], { type }));
  const anchor = document.createElement("a"); anchor.href = href; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

export function TradingAnalyticsPositioningFlow({
  reportDate, asOf, participants, participantVolumes, positioningCoverage, participantHistory, activity, legs, spot,
  expiry, maxPainStrikes, selectedCeStrike, selectedPeStrike, candles, structuralLevels, onInspect,
}: {
  reportDate: string; asOf: string; participants: EvidenceRow[];
  participantVolumes: EvidenceRow[]; positioningCoverage?: PositioningCoverage; participantHistory?: ParticipantHistory; activity: EvidenceRow[]; legs: EvidenceRow[];
  spot: number | null; expiry: string | null; maxPainStrikes: number[];
  selectedCeStrike: number | null; selectedPeStrike: number | null;
  candles: EvidenceRow[]; structuralLevels: EvidenceRow[]; onInspect: (row: EvidenceRow) => void;
}) {
  const [metric, setMetric] = useState<PositioningMetric>("options_proxy");
  const [tab, setTab] = useState<Tab>("overview");
  const definition = positioningMetrics.find((candidate) => candidate.key === metric)!;
  const participantRows = useMemo(() => participantOrder.map((name) => participants.find((row) => row.client_type === name) ?? { client_type: name }), [participants]);
  const strikeRows = useMemo(() => buildStrikeFlowRows(legs), [legs]);
  const structure = useMemo(() => extractStructuralLevels(structuralLevels), [structuralLevels]);
  const probableZones = useMemo(() => buildProbableZones(strikeRows, structure, participants, 45, spot), [strikeRows, structure, participants, spot]);
  const market = useMemo(() => summarizeStrikeFlow(strikeRows), [strikeRows]);
  const alignment = useMemo(() => fiiProAlignment(participants, metric), [participants, metric]);
  const evaluation = useMemo(() => buildParticipantForwardEvaluation(participantHistory?.rows ?? [], candles, metric), [participantHistory?.rows, candles, metric]);
  const atm = useMemo(() => spot == null || !strikeRows.length ? null : [...strikeRows].sort((left, right) => Math.abs(left.strike - spot) - Math.abs(right.strike - spot))[0].strike, [spot, strikeRows]);
  const effectiveCeStrike = selectedCeStrike ?? atm;
  const effectivePeStrike = selectedPeStrike ?? atm;
  const ceLeaders = useMemo(() => [...strikeRows].filter((row) => row.ce.oi != null).sort((left, right) => right.ce.oi! - left.ce.oi!).slice(0, 2).map((row) => row.strike), [strikeRows]);
  const peLeaders = useMemo(() => [...strikeRows].filter((row) => row.pe.oi != null).sort((left, right) => right.pe.oi! - left.pe.oi!).slice(0, 2).map((row) => row.strike), [strikeRows]);
  const oiMaximum = Math.max(1, ...strikeRows.flatMap((row) => [row.ce.oi ?? 0, row.pe.oi ?? 0]));
  const volumeMaximum = Math.max(1, ...strikeRows.flatMap((row) => [row.ce.intervalVolume ?? 0, row.pe.intervalVolume ?? 0]));
  const deltaMaximum = Math.max(1, ...strikeRows.flatMap((row) => [Math.abs(row.ce.oiChange ?? 0), Math.abs(row.pe.oiChange ?? 0)]));

  const quadrantOption = useMemo<EChartsOption>(() => ({
    animation: false,
    grid: { left: 22, right: 20, top: 24, bottom: 28, containLabel: true },
    tooltip: { formatter: (candidate: unknown) => {
      const point = candidate as { data?: { name?: string; value?: unknown[]; state?: string } };
      return `${point.data?.name ?? ""}<br/>Current ${compact(point.data?.value?.[0])}<br/>Change ${compact(point.data?.value?.[1])}<br/>${point.data?.state ?? ""}`;
    } },
    xAxis: { type: "value", name: `Current ${definition.label}`, nameLocation: "middle", nameGap: 25, splitLine: { lineStyle: { color: "#d8dee9" } } },
    yAxis: { type: "value", name: "Change vs previous report", splitLine: { lineStyle: { color: "#d8dee9" } } },
    series: [{ type: "scatter", symbolSize: 18, data: participantRows.map((row) => ({
      name: participantLabel(row.client_type),
      value: [finite(row[definition.key]), finite(row[definition.deltaKey])],
      state: participantPositionState(row[definition.key], row[definition.deltaKey]),
      itemStyle: { color: participantColours[String(row.client_type)] ?? "#64748b", borderColor: "#fff", borderWidth: 2 },
      label: { show: true, position: "top" as const, formatter: participantLabel(row.client_type), fontWeight: 700 },
    })).filter((point) => point.value.every((value) => value != null)), markLine: { silent: true, symbol: "none", label: { show: false }, data: [{ xAxis: 0 }, { yAxis: 0 }] } }],
  }), [definition, participantRows]);

  const rotationOption = useMemo<EChartsOption>(() => ({
    animation: false,
    color: participantRows.map((row) => participantColours[String(row.client_type)] ?? "#64748b"),
    tooltip: { trigger: "axis" }, legend: { data: participantRows.map((row) => participantLabel(row.client_type)), top: 0 },
    grid: { left: 26, right: 22, top: 36, bottom: 24, containLabel: true },
    xAxis: { type: "category", data: ["Previous", "Current"] },
    yAxis: { type: "value", name: definition.unit },
    series: participantRows.map((row) => ({
      name: participantLabel(row.client_type), type: "line", symbolSize: 8, lineStyle: { width: 3 },
      data: [finite(row[definition.previousKey]), finite(row[definition.key])], connectNulls: false,
    })),
  }), [definition, participantRows]);

  const bubbleOption = useMemo<EChartsOption>(() => ({
    animation: false, legend: { data: ["CE", "PE"] },
    tooltip: { formatter: (candidate: unknown) => {
      const point = candidate as { data?: { value?: unknown[]; name?: string; classification?: string } };
      const value = point.data?.value ?? [];
      return `${point.data?.name}<br/>Strike ${number(value[0], 0)}<br/>ΔOI ${compact(value[1])}<br/>Volume ${compactUnsigned(value[2])}<br/>${point.data?.classification ?? ""}`;
    } },
    grid: { left: 24, right: 20, top: 40, bottom: 34, containLabel: true },
    xAxis: { type: "value", name: "Strike", nameLocation: "middle", nameGap: 28 },
    yAxis: { type: "value", name: "Signed ΔOI" },
    series: (["ce", "pe"] as const).map((side) => ({
      name: side.toUpperCase(), type: "scatter",
      data: strikeRows.filter((row) => row[side].oiChange != null && row[side].intervalVolume != null && row[side].intervalVolume! > 0).map((row) => ({
        name: `${side.toUpperCase()} ${number(row.strike, 0)}`,
        value: [row.strike, row[side].oiChange, row[side].intervalVolume], classification: row[side].classification,
        symbolSize: 32 * Math.sqrt(row[side].intervalVolume! / volumeMaximum),
        itemStyle: { color: row[side].oiChange! >= 0 ? "#16a34a" : "#dc2626", borderColor: side === "ce" ? "#2563eb" : "#a16207", borderWidth: 3, opacity: .78 },
      })),
      markLine: { silent: true, symbol: "none", label: { show: false }, data: [{ yAxis: 0 }] },
    })),
  }), [strikeRows, volumeMaximum]);

  const flowExport = {
    reportDate, asOf, expiry,
    scope: { participants: "aggregate participant outstanding positions", activity: "FII daily derivatives activity/value", chain: "anonymous tracked-strike option market" },
    participants: participantRows, participantTradingVolumes: participantVolumes, activity, strikeFlow: strikeRows,
    dataCoverage: positioningCoverage ?? null,
    candidateLevels: {
      label: "Candidate positioning zones",
      disclaimer: "Anonymous market strike evidence with aggregate participant context; not participant-specific strike ownership.",
      weights: LEVEL_WEIGHTS,
      persistenceState: "UNAVAILABLE_REQUIRES_MULTI_SNAPSHOT_HISTORY",
      deltaEquivalentState: "UNAVAILABLE_CONTRACT_DELTA_SOURCE_NOT_CONNECTED",
      zones: probableZones,
    },
  };
  const exportCsv = () => {
    const header = ["Record type", "Participant", "Report date", "Previous report date", "Net calls", "Previous net calls", "Delta net calls", "Net puts", "Previous net puts", "Delta net puts", "Options proxy", "Previous options proxy", "Delta options proxy", "Futures net", "Previous futures net", "Delta futures net", "Activity segment", "Activity net INR crore", "Strike", "Side", "Price", "Matched baseline price", "Matched price change", "Matched price change %", "Session open", "Session-open change", "Session-open change %", "OI", "Baseline OI", "OI change", "OI change %", "Session cumulative volume", "Baseline volume counter", "Interval volume", "Net OI to interval volume", "Ratio quality", "OI share", "Absolute delta OI share", "Interval volume share", "Classification", "Comparison window", "Volume counter state", "Baseline kind", "Baseline at", "Observed at", "OI unit", "Volume unit", "Level rank", "Level role", "Zone low", "Core strike", "Zone high", "Activity score", "Score model", "Participant alignment", "Data coverage", "Persistence", "OI velocity per hour", "Structural confluence", "Warnings"];
    const quote = (value: unknown) => {
      const raw = String(value ?? "");
      const safe = typeof value === "string" && /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
      return `"${safe.replaceAll('"', '""')}"`;
    };
    const padded = (values: unknown[]) => [...values, ...Array(Math.max(0, header.length - values.length)).fill("")];
    const participantLines = participantRows.map((row) => padded(["participant_position", participantLabel(row.client_type), reportDate, row.previous_trade_date, row.net_calls, row.previous_net_calls, row.delta_net_calls, row.net_puts, row.previous_net_puts, row.delta_net_puts, row.options_proxy, row.previous_options_proxy, row.delta_options_proxy, row.net_futures, row.previous_net_futures, row.delta_net_futures]));
    const participantVolumeLines = participantVolumes.map((row) => padded(["participant_trading_volume", participantLabel(row.client_type), reportDate, row.previous_trade_date, row.net_calls, row.previous_net_calls, row.delta_net_calls, row.net_puts, row.previous_net_puts, row.delta_net_puts, row.options_proxy, row.previous_options_proxy, row.delta_options_proxy, row.net_futures, row.previous_net_futures, row.delta_net_futures]));
    const activityLines = activity.map((row) => padded(["fii_report_activity", "FII", reportDate, "", "", "", "", "", "", "", "", "", "", "", "", "", row.fii_derivatives, row.net_crore]));
    const strikeLines = strikeRows.flatMap((row) => (["ce", "pe"] as const).map((side) => {
      const leg = row[side]; return padded(["anonymous_option_chain", "", reportDate, "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", row.strike, side.toUpperCase(), leg.price, leg.baselinePrice, leg.priceChange, leg.priceChangePct, leg.sessionOpenPrice, leg.sessionOpenChange, leg.sessionOpenChangePct, leg.oi, leg.baselineOi, leg.oiChange, leg.oiChangePct, leg.volume, leg.baselineVolume, leg.intervalVolume, leg.netOiToIntervalVolume, leg.netOiToIntervalVolumeState, leg.oiShare, leg.deltaOiShare, leg.intervalVolumeShare, leg.classification, leg.comparisonWindowState, leg.volumeCounterState, leg.baselineKind, leg.baselineAt, leg.observedAt, leg.oiUnit, leg.volumeUnit]);
    }));
    const levelLines = probableZones.map((zone) => {
      const values = padded(["probable_positioning_zone", "", reportDate]);
      values[47] = zone.rank; values[48] = zone.role; values[49] = zone.zoneLow; values[50] = zone.coreStrike; values[51] = zone.zoneHigh;
      values[52] = zone.marketStrength; values[53] = zone.ruleVersion; values[54] = zone.participantAlignment; values[55] = zone.confidence;
      values[56] = zone.persistence; values[57] = zone.velocityPerHour; values[58] = zone.structuralConfluence.join(" | ");
      values[59] = [...new Set(zone.evidence.flatMap((item) => item.warnings))].join(" | ");
      return values;
    });
    const lines = [header, ...participantLines, ...participantVolumeLines, ...activityLines, ...strikeLines, ...levelLines];
    download(`positioning-flow-${reportDate}.csv`, lines.map((row) => row.map(quote).join(",")).join("\n"), "text/csv;charset=utf-8");
  };

  return <section className={css.page} data-testid="positioning-flow">
    <header className={css.command}>
      <div><h2>Positioning &amp; Flow</h2><p>Participant report {reportDate} · all index derivatives · NIFTY chain {expiry ?? "unavailable"} · selected expiry / tracked strikes · NIFTY {number(spot)} · Chain updated {asOf}</p></div>
      <label>Compare <select value={metric} onChange={(event) => setMetric(event.target.value as PositioningMetric)}>{positioningMetrics.map((candidate) => <option key={candidate.key} value={candidate.key}>{candidate.label}</option>)}</select></label>
      <button onClick={() => download(`positioning-flow-${reportDate}.json`, JSON.stringify(flowExport, null, 2), "application/json")}>Export JSON</button>
      <button onClick={exportCsv}>Export CSV</button>
    </header>
    <nav className={css.tabs} aria-label="Positioning and Flow sections">{([['overview', 'Overview'], ['market', 'Market Flow'], ['levels', 'Candidate Levels'], ['history', 'History'], ['evaluation', 'Evaluation'], ['coverage', 'Data Coverage']] as [Tab, string][]).map(([id, label]) => <button key={id} aria-current={tab === id ? "page" : undefined} onClick={() => setTab(id)}>{label}</button>)}</nav>

    {tab === "overview" && <>
      <div className={css.participantCards}>{participantRows.map((row) => <button key={String(row.client_type)} className={css.participantCard} onClick={() => onInspect(row)}>
        <span>{participantLabel(row.client_type)}</span>
        <strong className={signedClass(row[definition.key])}>{compact(row[definition.key])}</strong>
        <b className={signedClass(row[definition.deltaKey])}>{compact(row[definition.deltaKey])} change</b>
        <small>Previous {compact(row[definition.previousKey])}</small>
        <em>{participantPositionState(row[definition.key], row[definition.deltaKey])}</em>
        <i><span>Calls {compact(row.net_calls)}</span><span>Puts {compact(row.net_puts)}</span><span>Futures {compact(row.net_futures)}</span><span>Long {finite(row.futures_long_pct) == null ? "—" : `${finite(row.futures_long_pct)!.toFixed(1)}%`}</span></i>
      </button>)}</div>
      <section className={css.activityStrip} aria-label="FII activity versus outstanding position"><strong>FII activity · ₹ crore</strong>{["INDEX FUTURES", "INDEX OPTIONS", "STOCK FUTURES", "STOCK OPTIONS"].map((name) => { const row = activity.find((candidate) => candidate.fii_derivatives === name); return <span key={name}>{name.replace("INDEX", "IDX").replace("STOCK", "STK")} <b className={signedClass(row?.net_crore)}>{compact(row?.net_crore)}</b></span>; })}<i>Activity/value is not outstanding position.</i></section>
      <div className={css.heroGrid}>
        <article><header><strong>Current position vs change</strong><span>Four descriptive quadrants</span></header><Suspense fallback={<p>Loading chart…</p>}><Chart className={css.heroChart} ariaLabel={`${definition.label} current participant position versus previous-report change`} axisExtentPolicy="native" option={quadrantOption} /></Suspense></article>
        <article><header><strong>Participant rotation</strong><span>Previous report → current report</span></header><Suspense fallback={<p>Loading chart…</p>}><Chart className={css.heroChart} ariaLabel={`${definition.label} participant rotation from previous to current report`} axisExtentPolicy="native" option={rotationOption} /></Suspense></article>
      </div>
      <section className={css.alignmentGrid}>
        <div><strong>FII + Pro alignment</strong><span>Current direction <b>{alignment.currentDirection}</b></span><span>Change direction <b>{alignment.changeDirection}</b></span><span>Client relation <b>{alignment.clientRelation}</b></span></div>
        <div><strong>Market option flow · tracked strikes</strong><span>CE ΔOI <b className={signedClass(market.ce.deltaOi)}>{compact(market.ce.deltaOi)}</b></span><span>PE ΔOI <b className={signedClass(market.pe.deltaOi)}>{compact(market.pe.deltaOi)}</b></span><span><b>{market.marketState}</b></span></div>
        <div><strong>Participant ↔ market</strong><span>Participant context <b>{alignment.currentDirection.includes("ALIGNED") ? alignment.currentDirection : "MIXED"}</b></span><span>Market response <b>{market.marketState}</b></span><span><b>{alignment.currentDirection.includes("DIVERGENT") || market.marketState.includes("Mixed") ? "DIVERGENT / MIXED" : "Descriptively aligned"}</b></span></div>
      </section>
      <LikelyLevelSummary zones={probableZones} />
      <MarketSummary market={market} spot={spot} maxPainStrikes={maxPainStrikes} />
      <StrikeMatrix rows={strikeRows} atm={atm} maxPainStrikes={maxPainStrikes} ceLeaders={ceLeaders} peLeaders={peLeaders} selectedCeStrike={effectiveCeStrike} selectedPeStrike={effectivePeStrike} oiMaximum={oiMaximum} deltaMaximum={deltaMaximum} volumeMaximum={volumeMaximum} />
    </>}
    {tab === "market" && <><MarketSummary market={market} spot={spot} maxPainStrikes={maxPainStrikes} /><div className={css.marketGrid}><StrikeMatrix rows={strikeRows} atm={atm} maxPainStrikes={maxPainStrikes} ceLeaders={ceLeaders} peLeaders={peLeaders} selectedCeStrike={effectiveCeStrike} selectedPeStrike={effectivePeStrike} oiMaximum={oiMaximum} deltaMaximum={deltaMaximum} volumeMaximum={volumeMaximum} /><article><header><strong>OI / volume bubble map</strong><span>Bubble size = volume · fill = signed ΔOI · outline = CE/PE</span></header>{market.ce.deltaCoverage + market.pe.deltaCoverage ? <Suspense fallback={<p>Loading chart…</p>}><Chart className={css.bubbleChart} ariaLabel="Strike by signed change in open interest with volume-sized bubbles" axisExtentPolicy="native" option={bubbleOption} /></Suspense> : <div className={css.empty}>Change baseline unavailable · 0/{strikeRows.length * 2} comparable contracts. Missing values are not zero.</div>}<p>Contract classifications describe the option itself and are not an automatic NIFTY recommendation.</p></article></div></>}
    {tab === "levels" && <LikelyLevels zones={probableZones} participants={participantRows} participantVolumes={participantVolumes} spot={spot} reportDate={reportDate} />}
    {tab === "history" && <ParticipantOptionsHistoryChart history={participantHistory} smallMultiples />}
    {tab === "evaluation" && <section className={css.evaluation}><h3>Historical evaluation · next completed NIFTY session</h3><p>Correlation is descriptive, not causal. It uses matched official participant report dates and retained daily NIFTY candles. Historical timestamp-matched chain, first-30-minute and first-60-minute inputs are unavailable in this response and are not fabricated.</p><div className={css.evaluationNotice}><strong>Likely-level outcome history unavailable</strong><span>Reach, rejection and confirmed-break rules are implemented and fixture-tested, but no production result is claimed until zones are persisted before each session and replayed without later price/OI leakage.</span></div><table><thead><tr><th>Participant</th><th>Variable</th><th>Current → next open-close</th><th>N</th><th>Report change → next open-close</th><th>N</th></tr></thead><tbody>{evaluation.map((row) => <tr key={row.participant}><th>{participantLabel(row.participant)}</th><td>{definition.label}</td><td>{row.currentOpenCloseCorrelation.value?.toFixed(3) ?? "—"}</td><td>{row.currentOpenCloseCorrelation.samples}</td><td>{row.deltaOpenCloseCorrelation.value?.toFixed(3) ?? "—"}</td><td>{row.deltaOpenCloseCorrelation.samples}</td></tr>)}</tbody></table></section>}
    {tab === "coverage" && <DataCoverage coverage={positioningCoverage} />}
  </section>;
}

function DataCoverage({ coverage }: { coverage?: PositioningCoverage }) {
  return <section className={css.coverage} data-testid="positioning-flow-coverage"><header><h3>Positioning &amp; Flow data coverage</h3><p>Retained database coverage is distinct from downloaded, parsed and source-validated artifact coverage.</p></header>{coverage ? <><div className={css.coverageCards}>{coverage.families.map((row) => <article key={String(row.family)}><strong>{String(row.family).replaceAll("_", " ")}</strong><b>{number(row.dates, 0)} dates</b><span>{number(row.rows, 0)} loaded rows</span><small>{String(row.first_date ?? "—")} → {String(row.last_date ?? "—")}</small><em>{finite(row.dates) != null && finite(row.dates)! >= coverage.requestedPilotSessions ? "60-session pilot available" : `Pilot shortfall · ${number(row.dates, 0)}/${coverage.requestedPilotSessions}`}</em></article>)}</div><table><thead><tr><th>Family</th><th>Downloaded</th><th>Parsed</th><th>Loaded</th><th>Validated</th><th>State</th></tr></thead><tbody>{coverage.families.map((row) => <tr key={String(row.family)}><th>{String(row.family)}</th><td>{row.downloaded == null ? "—" : number(row.downloaded, 0)}</td><td>{row.parsed == null ? "—" : number(row.parsed, 0)}</td><td>{number(row.loaded, 0)}</td><td>{row.validated == null ? "—" : number(row.validated, 0)}</td><td>{row.validated == null ? "Validation evidence unavailable" : "Validated"}</td></tr>)}</tbody></table>{coverage.limitations.map((item) => <p key={item}>• {item}</p>)}</> : <div className={css.empty}>Coverage query unavailable.</div>}</section>;
}

function LikelyLevelSummary({ zones }: { zones: ProbableZone[] }) {
  const top = zones.slice(0, 4);
  return <section className={css.levelSummary} data-testid="positioning-flow-level-summary">
    <strong>Candidate positioning zones</strong>
    {top.map((zone) => <span key={`${zone.role}-${zone.coreStrike}`} data-role={zone.role.toLowerCase()}><b>{zone.role === "Resistance" ? "R" : "S"}{zone.rank}</b>{number(zone.zoneLow, 0)}–{number(zone.zoneHigh, 0)} <small>{zone.marketStrength.toFixed(0)} · {zone.buildState}</small></span>)}
    {!top.length && <span>Insufficient comparable strike evidence</span>}
    <i>Anonymous strike evidence · aggregate participant context</i>
  </section>;
}

function LikelyLevels({ zones, participants, participantVolumes, spot, reportDate }: {
  zones: ProbableZone[]; participants: EvidenceRow[]; participantVolumes: EvidenceRow[]; spot: number | null; reportDate: string;
}) {
  const volumeRows = participantOrder.map((name) => participantVolumes.find((row) => row.client_type === name) ?? { client_type: name });
  const reportedVolumeCount = volumeRows.filter((row) => finite(row.options_proxy) != null).length;
  const gross = (row: EvidenceRow) => {
    const values = [row.option_index_call_long, row.option_index_call_short, row.option_index_put_long, row.option_index_put_short].map(finite);
    return values.some((value) => value == null) ? null : values.reduce<number>((sum, value) => sum + value!, 0);
  };
  const buySide = (row: EvidenceRow) => {
    const values = [row.option_index_call_long, row.option_index_put_long].map(finite);
    return values.some((value) => value == null) ? null : values.reduce<number>((sum, value) => sum + value!, 0);
  };
  const sellSide = (row: EvidenceRow) => {
    const values = [row.option_index_call_short, row.option_index_put_short].map(finite);
    return values.some((value) => value == null) ? null : values.reduce<number>((sum, value) => sum + value!, 0);
  };
  const grossTotal = volumeRows.reduce((sum, row) => sum + (gross(row) ?? 0), 0);
  const buyTotal = volumeRows.reduce((sum, row) => sum + (buySide(row) ?? 0), 0);
  const sellTotal = volumeRows.reduce((sum, row) => sum + (sellSide(row) ?? 0), 0);
  return <section className={css.levels} data-testid="positioning-flow-likely-levels">
    <header className={css.levelHeader}><div><h3>Candidate positioning levels</h3><p>Activity score uses anonymous option-chain evidence. Participant alignment is a separate aggregate context; it does not assign FII, Pro or Client ownership to any strike.</p></div><span>Uncalibrated research model · {reportDate}</span></header>
    <div className={css.availability}>
      <span><b>Participant trading volume</b>{reportedVolumeCount ? `${reportedVolumeCount}/4 reported` : "Unavailable"}</span>
      <span><b>Persistence</b>Unavailable · requires multi-snapshot retained history</span>
      <span><b>Delta-weighted OI</b>Unavailable · contract delta source not connected</span>
      <span><b>Historical outcomes</b>Not yet persisted before session</span>
    </div>
    <div className={css.levelGrid}>
      <div className={css.levelTable}><table><thead><tr><th>Rank</th><th>Model</th><th>Zone</th><th>Core</th><th>Role hypothesis</th><th>Activity score</th><th>OI</th><th>ΔOI</th><th>Interval volume</th><th>Velocity/h</th><th>OI state</th><th>Participant context</th><th>Structure</th><th>Coverage</th></tr></thead><tbody>{zones.map((zone) => <tr key={`${zone.role}-${zone.coreStrike}`} data-role={zone.role.toLowerCase()}><td>{zone.rank}</td><td title={zone.ruleVersion}>{zone.variant}</td><td>{number(zone.zoneLow, 0)}–{number(zone.zoneHigh, 0)}</td><th>{number(zone.coreStrike, 0)}</th><td>Candidate {zone.role.toLowerCase()}</td><td><span className={css.score}><i style={{ width: `${Math.min(100, zone.marketStrength)}%` }} /><b>{zone.marketStrength.toFixed(0)}</b></span></td><td>{compactUnsigned(zone.oi)}</td><td className={signedClass(zone.deltaOi)}>{compact(zone.deltaOi)}</td><td>{compactUnsigned(zone.volume)}</td><td className={signedClass(zone.velocityPerHour)}>{compact(zone.velocityPerHour)}</td><td>{zone.buildState}</td><td>{zone.participantAlignment}</td><td>{zone.structuralConfluence.join(" · ") || "—"}</td><td>{zone.variant === "L1" ? "L1 complete" : "L0 fallback"}</td></tr>)}</tbody></table>{!zones.length && <div className={css.empty}>No eligible levels for this scope.</div>}</div>
      <aside className={css.levelAside}>
        <section><h4>Participant context</h4>{participants.map((row) => <div key={String(row.client_type)}><b>{participantLabel(row.client_type)}</b><span className={signedClass(row.options_proxy)}>{compact(row.options_proxy)}</span><small>{participantPositionState(row.options_proxy, row.delta_options_proxy)}</small></div>)}</section>
        <section><h4>Current level map</h4><div className={css.spot}>NIFTY {number(spot)}</div>{[...zones].sort((left, right) => right.coreStrike - left.coreStrike).map((zone) => <div key={`${zone.role}-${zone.coreStrike}`}><b>{number(zone.coreStrike, 0)}</b><span>{zone.role}</span><small>{zone.marketStrength.toFixed(0)}</small></div>)}</section>
      </aside>
    </div>
    <section className={css.volumeTable}><header><strong>Participant-wise trading volumes</strong><span>All-index aggregate report activity; never attributed to a NIFTY strike.</span></header><table><thead><tr><th>Participant</th><th>Reported volume balance</th><th>Previous-report change</th><th>Gross option activity</th><th>Activity share</th><th>Buy-side share</th><th>Sell-side share</th><th>Position change</th><th>Position-flow residual</th><th>State</th></tr></thead><tbody>{volumeRows.map((row) => { const position = participants.find((candidate) => candidate.client_type === row.client_type); const grossValue = gross(row); const buyValue = buySide(row); const sellValue = sellSide(row); const residual = finite(position?.delta_options_proxy) == null || finite(row.options_proxy) == null ? null : finite(position?.delta_options_proxy)! - finite(row.options_proxy)!; return <tr key={String(row.client_type)}><th>{participantLabel(row.client_type)}</th><td className={signedClass(row.options_proxy)}>{compact(row.options_proxy)}</td><td className={signedClass(row.delta_options_proxy)}>{compact(row.delta_options_proxy)}</td><td>{compactUnsigned(grossValue)}</td><td>{grossValue == null || grossTotal <= 0 ? "—" : percent(100 * grossValue / grossTotal)}</td><td title="Participant option-long activity divided by all reported participant option-long activity.">{buyValue == null || buyTotal <= 0 ? "—" : percent(100 * buyValue / buyTotal)}</td><td title="Participant option-short activity divided by all reported participant option-short activity.">{sellValue == null || sellTotal <= 0 ? "—" : percent(100 * sellValue / sellTotal)}</td><td className={signedClass(position?.delta_options_proxy)}>{compact(position?.delta_options_proxy)}</td><td className={signedClass(residual)} title="Position change minus reported volume balance; expiry, exercise, clearing and corrections may create residuals.">{compact(residual)}</td><td>{participantPositionState(row.options_proxy, row.delta_options_proxy)}</td></tr>; })}</tbody></table></section>
    <details className={css.formula}><summary>Level score and evidence policy</summary><p><b>L0</b> ranks current OI only. <b>L1</b> is an activity score: current OI 40%, comparable interval volume 30%, and absolute OI adjustment 30%. If any mandatory L1 input is absent, the row is explicitly labelled L0 fallback; weights are never renormalised. L2 is unavailable until matched RVOL, past-only persistence and proximity inputs exist. Scores are uncalibrated research scores, never probabilities. Candidate resistance uses CE strikes at/above spot; candidate support uses PE strikes at/below spot. Adjacent listed strikes merge without bridging missing strikes.</p></details>
  </section>;
}

function MarketSummary({ market, spot, maxPainStrikes }: { market: ReturnType<typeof summarizeStrikeFlow>; spot: number | null; maxPainStrikes: number[] }) {
  return <section className={css.marketSummary} aria-label="Market option flow summary"><span><b>NIFTY</b>{number(spot)}</span><span><b>CE OI</b>{compactUnsigned(market.ce.oi)} <small>{market.ce.oiCoverage}/{market.ce.total}</small></span><span><b>PE OI</b>{compactUnsigned(market.pe.oi)} <small>{market.pe.oiCoverage}/{market.pe.total}</small></span><span><b>CE ΔOI</b><i className={signedClass(market.ce.deltaOi)}>{compact(market.ce.deltaOi)}</i> <small>{market.ce.deltaCoverage}/{market.ce.total}</small></span><span><b>PE ΔOI</b><i className={signedClass(market.pe.deltaOi)}>{compact(market.pe.deltaOi)}</i> <small>{market.pe.deltaCoverage}/{market.pe.total}</small></span><span><b>OI PCR</b>{number(market.oiPcr)}</span><span><b>Volume PCR</b>{number(market.volumePcr)}</span><span><b>Max Pain</b>{maxPainStrikes.length ? maxPainStrikes.map((value) => number(value, 0)).join(" / ") : "—"}</span></section>;
}

function StrikeMatrix({ rows, atm, maxPainStrikes, ceLeaders, peLeaders, selectedCeStrike, selectedPeStrike, oiMaximum, deltaMaximum, volumeMaximum }: { rows: ReturnType<typeof buildStrikeFlowRows>; atm: number | null; maxPainStrikes: number[]; ceLeaders: number[]; peLeaders: number[]; selectedCeStrike: number | null; selectedPeStrike: number | null; oiMaximum: number; deltaMaximum: number; volumeMaximum: number }) {
  const rank = (leaders: number[], strike: number, prefix: string) => { const index = leaders.indexOf(strike); return index < 0 ? null : `${prefix}${index + 1}`; };
  const Bar = ({ value, maximum, kind }: { value: number | null; maximum: number; kind: "ce" | "pe" | "signed" }) => <span className={css.dataBar}><i data-kind={kind} data-sign={value == null ? "missing" : value < 0 ? "negative" : "positive"} style={{ width: `${100 * Math.abs(value ?? 0) / maximum}%` }} /><b>{kind === "signed" ? compact(value) : compactUnsigned(value)}</b></span>;
  return <section className={css.matrix} data-testid="positioning-flow-strike-matrix"><header><strong>Strike Flow Matrix</strong><span>OI, ΔOI and volume are separate measures · shares are within each tracked CE/PE side</span></header><div><table><thead><tr><th>CE Price</th><th>CE ΔPrice</th><th>CE OI</th><th>CE ΔOI</th><th>CE Vol</th><th>CE State</th><th>Strike</th><th>PE State</th><th>PE Vol</th><th>PE ΔOI</th><th>PE OI</th><th>PE ΔPrice</th><th>PE Price</th></tr></thead><tbody>{rows.map((row) => <tr key={row.strike} data-ce-selected={row.strike === selectedCeStrike || undefined} data-pe-selected={row.strike === selectedPeStrike || undefined}>
    <td className={css.ce}>{number(row.ce.price)}</td><td className={signedClass(row.ce.sessionOpenChange)} title={`${percent(row.ce.sessionOpenChangePct)} from session open; Price/OI pattern uses the separate matched snapshot baseline.`}>{compact(row.ce.sessionOpenChange)}</td><td title={`CE OI share ${percent(row.ce.oiShare == null ? null : 100 * row.ce.oiShare)}`}><Bar value={row.ce.oi} maximum={oiMaximum} kind="ce" /></td><td className={signedClass(row.ce.oiChange)} title={`CE |ΔOI| share ${percent(row.ce.deltaOiShare == null ? null : 100 * row.ce.deltaOiShare)} · ${row.ce.baselineKind}`}><Bar value={row.ce.oiChange} maximum={deltaMaximum} kind="signed" /></td><td title={`CE interval-volume share ${percent(row.ce.intervalVolumeShare == null ? null : 100 * row.ce.intervalVolumeShare)} · ${row.ce.volumeCounterState}`}><Bar value={row.ce.intervalVolume} maximum={volumeMaximum} kind="ce" /></td><td title={`${row.ce.comparisonWindowState}; convention only, owner and trade intent not identified`}>{row.ce.classification === "Unavailable" ? "Not comparable" : row.ce.classification}</td>
    <th>{number(row.strike, 0)}<span>{row.strike === atm && <em>ATM</em>}{maxPainStrikes.includes(row.strike) && <em data-kind="max">MAX</em>}{rank(ceLeaders, row.strike, "CE") && <em data-kind="ce">{rank(ceLeaders, row.strike, "CE")}</em>}{rank(peLeaders, row.strike, "PE") && <em data-kind="pe">{rank(peLeaders, row.strike, "PE")}</em>}{row.strike === selectedCeStrike && <em data-kind="ce">CE SEL</em>}{row.strike === selectedPeStrike && <em data-kind="pe">PE SEL</em>}</span></th>
    <td title={`${row.pe.comparisonWindowState}; convention only, owner and trade intent not identified`}>{row.pe.classification === "Unavailable" ? "Not comparable" : row.pe.classification}</td><td title={`PE interval-volume share ${percent(row.pe.intervalVolumeShare == null ? null : 100 * row.pe.intervalVolumeShare)} · ${row.pe.volumeCounterState}`}><Bar value={row.pe.intervalVolume} maximum={volumeMaximum} kind="pe" /></td><td className={signedClass(row.pe.oiChange)} title={`PE |ΔOI| share ${percent(row.pe.deltaOiShare == null ? null : 100 * row.pe.deltaOiShare)} · ${row.pe.baselineKind}`}><Bar value={row.pe.oiChange} maximum={deltaMaximum} kind="signed" /></td><td title={`PE OI share ${percent(row.pe.oiShare == null ? null : 100 * row.pe.oiShare)}`}><Bar value={row.pe.oi} maximum={oiMaximum} kind="pe" /></td><td className={signedClass(row.pe.sessionOpenChange)} title={`${percent(row.pe.sessionOpenChangePct)} from session open; Price/OI pattern uses the separate matched snapshot baseline.`}>{compact(row.pe.sessionOpenChange)}</td><td className={css.pe}>{number(row.pe.price)}</td>
  </tr>)}</tbody></table></div>{!rows.length && <p className={css.empty}>Current tracked-strike option data unavailable.</p>}</section>;
}
