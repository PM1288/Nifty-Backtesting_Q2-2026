import { useCallback, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Info, RefreshCw, TriangleAlert } from "lucide-react";
import { StockLogo } from "../../components/stocks/StockProfileControls";
import { formatWholeNumber } from "../../lib/format";
import type { Quote } from "../../lib/types";
import {
  breadthRatio, breadthWording, buildMarketStory, parseSummaryLens,
  type TodaySector,
} from "./todayModel";
import { BreadthBar, MarketSummaryStrip, Move, PanelState, QuickView, type QuickViewState, SectorIcon, StockRow } from "./TodayShared";
import { useTodayData } from "./useTodayData";
import styles from "./Today.module.css";

export function TodaySummaryPage() {
  const { model, overview, profiles, live, authReady } = useTodayData();
  const [params, setParams] = useSearchParams();
  const [quick, setQuick] = useState<QuickViewState>({ target: null, rect: null });
  const lens = parseSummaryLens(params.get("lens"));
  const selectedId = params.get("sector");
  const setUrl = useCallback((next: { lens?: string; sector?: string | null }) => {
    const copy = new URLSearchParams(params);
    if (next.lens) copy.set("lens", next.lens);
    if (next.sector === null) copy.delete("sector"); else if (next.sector) copy.set("sector", next.sector);
    setParams(copy);
  }, [params, setParams]);
  const selectSector = useCallback((sector: TodaySector) => { setQuick({ target: null, rect: null }); setUrl({ lens: "sector-matrix", sector: sector.id }); }, [setUrl]);
  if (!model) return <PanelState loading={!authReady || overview.isLoading} error={overview.error} />;
  const selected = model.sectors.find((sector) => sector.id === selectedId) ?? [...model.sectors].sort((a, b) => a.rank - b.rank)[0] ?? null;
  const boardHref = `/full-board${selected ? `?sector=${encodeURIComponent(selected.id)}` : ""}`;
  return <div className={styles.summaryPage} data-testid="today-summary">
    <MarketSummaryStrip model={model} />
    <div className={styles.lensBar}>
      <div role="tablist" aria-label="Today summary lens"><button role="tab" aria-selected={lens === "story"} onClick={() => setUrl({ lens: "story" })}>Market Story</button>
      <button role="tab" aria-selected={lens === "sector-matrix"} onClick={() => setUrl({ lens: "sector-matrix" })}>Sector Matrix</button></div>
      <span>{live.transport === "CONNECTED" ? "Live" : live.transport === "RECONNECTING" ? "Reconnecting" : "Snapshot"} · {model.asOf ? new Date(model.asOf).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "—"}</span>
      <Link to={boardHref}>Open Full Board</Link>
    </div>
    {lens === "story" ? <MarketStoryLens model={model} profiles={profiles.bySymbol} onSelectSector={selectSector} onOpenStock={(stock, target) => setQuick({ target: { type: "stock", symbol: stock.symbol }, rect: target.getBoundingClientRect() })} /> : selected ? <SectorMatrixLens model={model} selected={selected} profiles={profiles.bySymbol} onSelect={selectSector} onSelectSector={selectSector} onOpenStock={(stock, target) => setQuick({ target: { type: "stock", symbol: stock.symbol }, rect: target.getBoundingClientRect() })} /> : <div className={styles.pageState}>No sector evidence is available.</div>}
    <QuickView state={quick} model={model} profiles={profiles.bySymbol} onClose={() => setQuick({ target: null, rect: null })} onSelectSector={selectSector} />
  </div>;
}

type LensProps = { model: NonNullable<ReturnType<typeof useTodayData>["model"]>; profiles: ReturnType<typeof useTodayData>["profiles"]["bySymbol"]; onSelectSector: (sector: TodaySector) => void; onOpenStock: (stock: Quote, target: HTMLElement) => void };

function StoryBanner({ model }: { model: LensProps["model"] }) {
  const ranked = [...model.sectors].sort((a, b) => a.rank - b.rank);
  return <div className={styles.storyBanner}><Info size={17} aria-hidden="true" /><div><strong>{buildMarketStory(model)}</strong><span><b>Leader</b> {ranked[0]?.name ?? "—"}</span><span><b>Drag</b> {ranked.at(-1)?.name ?? "—"}</span><span><b>Breadth</b> {breadthWording(breadthRatio(model.breadth))}</span></div><small><RefreshCw size={12} /> Updated {model.asOf ? new Date(model.asOf).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "—"}</small></div>;
}

function MarketStoryLens(props: LensProps) {
  const { model, profiles, onSelectSector, onOpenStock } = props;
  const ranked = [...model.sectors].sort((a, b) => a.rank - b.rank);
  const positive = ranked.filter((sector) => (sector.movePct ?? 0) >= 0).slice(0, 5);
  const negative = [...ranked].reverse().filter((sector) => (sector.movePct ?? 0) < 0).slice(0, 5);
  const useSetups = model.oiisStrongest.length > 0 || model.oiisWeakest.length > 0;
  return <div className={styles.lensBody}>
    <StoryBanner model={model} />
    <div className={styles.storyWorkspace}>
      <section className={styles.panel}><header><div><strong>SECTOR RANKING</strong><small>All {model.sectors.length} sectors · stable positions</small></div></header><div className={styles.sectorTable} aria-label="Sector ranking"><div className={styles.sectorHead}><span>#</span><span>Sector</span><span>% Move</span><span>Breadth</span><span>Rank Δ</span></div>{model.sectors.map((sector) => <button key={sector.id} onClick={() => onSelectSector(sector)}><span>{sector.rank}</span><span><SectorIcon name={sector.name} />{sector.name}</span><Move value={sector.movePct} /><span>{sector.breadth.advancing}/{sector.breadth.total}<BreadthBar breadth={sector.breadth} /></span><span aria-label="Previous rank unavailable">—</span></button>)}</div></section>
      <section className={styles.panel}><header><div><strong>SECTOR LEADERSHIP</strong><small>Index contribution data unavailable; displaying sector movement.</small></div></header><div className={styles.leadership}><h3>TOP LEADERS</h3>{positive.map((sector) => <button key={sector.id} onClick={() => onSelectSector(sector)}><span>{sector.name}</span><i data-state="positive" style={{ width: `${Math.min(100, Math.abs(sector.movePct ?? 0) * 22)}%` }} /><Move value={sector.movePct} /></button>)}<h3>TOP DRAGGERS</h3>{negative.length ? negative.map((sector) => <button key={sector.id} onClick={() => onSelectSector(sector)}><span>{sector.name}</span><i data-state="negative" style={{ width: `${Math.min(100, Math.abs(sector.movePct ?? 0) * 22)}%` }} /><Move value={sector.movePct} /></button>) : <div className={styles.emptyInline}>No declining sector in this snapshot.</div>}</div></section>
      <section className={styles.panel}><header><div><strong>{useSetups ? "TRADE OPPORTUNITIES" : "MARKET MOVERS"}</strong><small>{useSetups ? "Canonical OIIS score" : "Opportunity classification unavailable; showing price movers."}</small></div></header><div className={styles.opportunities}><h3>{useSetups ? "STRONGEST SETUPS" : "STRONGEST MOVERS"}</h3>{(useSetups ? model.oiisStrongest : model.strongestMovers).map((stock) => <StockRow key={stock.symbol} stock={stock} profile={profiles.get(stock.symbol)} score={useSetups ? stock.oiisScore : null} onOpen={onOpenStock} />)}<h3>{useSetups ? "WEAKEST SETUPS" : "WEAKEST MOVERS"}</h3>{(useSetups ? model.oiisWeakest : model.weakestMovers).map((stock) => <StockRow key={stock.symbol} stock={stock} profile={profiles.get(stock.symbol)} score={useSetups ? stock.oiisScore : null} onOpen={onOpenStock} />)}</div></section>
    </div>
    <RiskStrip model={model} onOpenStock={onOpenStock} />
  </div>;
}

function SectorMatrixLens(props: LensProps & { selected: TodaySector; onSelect: (sector: TodaySector) => void }) {
  const { model, selected, profiles, onSelect, onOpenStock } = props;
  const top = [...selected.stocks].sort((a, b) => b.changePct - a.changePct || a.symbol.localeCompare(b.symbol)).slice(0, 10);
  return <div className={styles.lensBody}>
    <div className={styles.matrixSentence}><Info size={16} /><strong>{buildMarketStory(model)}</strong><small>Updated {model.asOf ? new Date(model.asOf).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "—"}</small></div>
    <div className={styles.matrixWorkspace}>
      <section className={styles.panel}><header><div><strong>SECTOR MATRIX</strong><small>{model.sectors.length} sectors · stable order</small></div></header><div className={styles.matrixTable} aria-label="Sector matrix"><div className={styles.matrixHead}><span>Rank</span><span>Δ</span><span>Sector</span><span>% Move</span><span>Breadth</span><span>Strongest</span><span>Weakest</span><span>Conviction</span></div>{model.sectors.map((sector) => <button data-selected={sector.id === selected.id ? "true" : "false"} key={sector.id} onClick={() => onSelect(sector)}><span>{sector.rank}</span><span>—</span><span><SectorIcon name={sector.name} />{sector.name}</span><Move value={sector.movePct} /><span>{sector.breadth.advancing}/{sector.breadth.total}<BreadthBar breadth={sector.breadth} /></span><StockCompact stock={sector.strongestStock} profile={sector.strongestStock ? profiles.get(sector.strongestStock.symbol) : undefined} /><StockCompact stock={sector.weakestStock} profile={sector.weakestStock ? profiles.get(sector.weakestStock.symbol) : undefined} /><span>—</span></button>)}</div></section>
      <section className={`${styles.panel} ${styles.selectedSector}`}><header><div><strong>SELECTED SECTOR: {selected.name.toUpperCase()}</strong><small>Rank #{selected.rank} · conviction unavailable</small></div><Link to={`/full-board?sector=${selected.id}`}>Open Full Board</Link></header><div className={styles.sectorStats}><Move value={selected.movePct} /><span>{selected.breadth.advancing} advancing · {selected.breadth.declining} declining</span><BreadthBar breadth={selected.breadth} /></div><div className={styles.chartEmpty}>Sector intraday series unavailable</div><h3>TOP STOCKS IN {selected.name.toUpperCase()}</h3><div className={styles.selectedStocks}>{top.map((stock) => <StockRow key={stock.symbol} stock={stock} profile={profiles.get(stock.symbol)} onOpen={onOpenStock} />)}</div></section>
    </div>
    <RiskStrip model={model} onOpenStock={onOpenStock} />
  </div>;
}

function StockCompact({ stock, profile }: { stock: Quote | null; profile?: ReturnType<typeof useTodayData>["profiles"]["bySymbol"] extends Map<string, infer P> ? P : never }) {
  if (!stock) return <span>—</span>;
  return <span className={styles.stockCompact}><StockLogo symbol={stock.symbol} profile={profile} size={15} /><b>{stock.symbol}</b><Move value={stock.changePct} /></span>;
}

function RiskStrip({ model, onOpenStock }: { model: LensProps["model"]; onOpenStock: LensProps["onOpenStock"] }) {
  const metrics = [{ label: "F&O anomalies", value: model.derivatives.anomalyCount }, { label: "Excess moves", value: model.derivatives.excessPriceMoveCount }, { label: "Wide spreads", value: model.derivatives.wideSpreadCount }, { label: "Big asks", value: model.derivatives.bigAskCount }, { label: "Big bids", value: model.derivatives.bigBidCount }];
  const alerts = model.allStocks.filter((stock) => stock.alert).slice(0, 5);
  return <section className={styles.riskStrip}><div><header><strong>RISK &amp; ANOMALY SNAPSHOT</strong></header><div className={styles.riskMetrics}>{metrics.map((item) => <Link key={item.label} to="/options/intelligence"><b>{formatWholeNumber(item.value)}</b><span>{item.label}</span></Link>)}</div></div><div><header><strong>TOP ALERTS</strong></header>{alerts.length ? alerts.map((stock) => <button key={stock.symbol} onClick={(event) => onOpenStock(stock, event.currentTarget)}><TriangleAlert size={13} /><b>{stock.symbol}</b><span>{stock.alert?.label}</span></button>) : <span className={styles.emptyInline}>No stock alert in this snapshot.</span>}</div><div><header><strong>TOP ANOMALIES</strong><Link to="/options/intelligence">Open F&amp;O Radar</Link></header>{model.derivatives.anomalies.slice(0, 4).map((alert) => <div className={styles.anomalyRow} key={alert.symbolToken}><b>{alert.tradingSymbol}</b><span>{alert.anomalyTypes.join(" · ")}</span><Move value={alert.changePct} /></div>)}</div></section>;
}
