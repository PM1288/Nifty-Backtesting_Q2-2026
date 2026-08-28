import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search, X } from "lucide-react";
import { StockLogo } from "../../components/stocks/StockProfileControls";
import { formatDecimal, formatNumber } from "../../lib/format";
import type { Quote } from "../../lib/types";
import type { StockProfileFilters } from "../../lib/stockProfiles";
import { parseBoardSort, parseQuickView, serializeQuickView, sortBoardStocks, stockMatchesProfile, type FullBoardSort, type TodaySector } from "./todayModel";
import { BreadthBar, MarketSummaryStrip, Move, PanelState, QuickView, type QuickViewState, SectorIcon } from "./TodayShared";
import { formatSignedPercent } from "./todayFormat";
import { useTodayData } from "./useTodayData";
import styles from "./Today.module.css";

type MetricLens = "price1d" | "price5d" | "volume" | "rsi" | "williams" | "oiis" | "opportunity";
const METRIC_LENSES = new Set<MetricLens>(["price1d", "price5d", "volume", "rsi", "williams", "oiis", "opportunity"]);

export function TodayFullBoardPage() {
  const { model, overview, profiles, authReady } = useTodayData();
  const [params, setParams] = useSearchParams();
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const inspect = parseQuickView(params.get("inspect"));
  const search = params.get("search") ?? "";
  const sort = parseBoardSort(params.get("sort"));
  const sectorId = params.get("sector") || null;
  const metricParam = params.get("view") as MetricLens | null;
  const metric = metricParam && METRIC_LENSES.has(metricParam) ? metricParam : "price1d";
  const filters: StockProfileFilters = { universe: params.get("universe")?.toUpperCase() || "ALL", capBucket: params.get("marketCap") || "ALL", sector: "ALL" };
  const patchUrl = useCallback((changes: Record<string, string | null>) => {
    const copy = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) value ? copy.set(key, value) : copy.delete(key);
    setParams(copy);
  }, [params, setParams]);
  if (!model) return <PanelState loading={!authReady || overview.isLoading} error={overview.error} />;
  const filteredSectors = model.sectors.map((sector) => ({ ...sector, stocks: sortBoardStocks(sector.stocks.filter((stock) => (!sectorId || sector.id === sectorId) && stockMatchesProfile(stock, profiles.bySymbol.get(stock.symbol), filters, search)), sort) })).filter((sector) => sector.stocks.length);
  const visible = filteredSectors.flatMap((sector) => sector.stocks);
  const openQuick = (target: QuickViewState["target"], element: HTMLElement) => { setAnchorRect(element.getBoundingClientRect()); patchUrl({ inspect: serializeQuickView(target) }); };
  const closeQuick = () => patchUrl({ inspect: null });
  const reset = () => { setParams(new URLSearchParams()); setAnchorRect(null); };
  return <div className={styles.fullBoardPage} data-testid="today-full-board">
    <MarketSummaryStrip model={model} compact />
    <FullBoardToolbar model={model} profiles={profiles.payload?.records ?? []} search={search} sort={sort} metric={metric} sectorId={sectorId} filters={filters} visibleCount={visible.length} onPatch={patchUrl} onReset={reset} />
    <VirtualisedSectorBoard sectors={filteredSectors} profiles={profiles.bySymbol} metric={metric} onSector={(sector, target) => openQuick({ type: "sector", id: sector.id }, target)} onStock={(stock, target) => openQuick({ type: "stock", symbol: stock.symbol }, target)} />
    <footer className={styles.boardFooter}><span><b>{visible.length}</b> visible / {model.allStocks.length} total</span><span><b>{model.derivatives.anomalyCount}</b> anomalies</span><span><b>{model.derivatives.excessPriceMoveCount}</b> excess moves</span><span>Strongest sector <b>{[...model.sectors].sort((a, b) => a.rank - b.rank)[0]?.name ?? "—"}</b></span><span>Top stock <b>{model.strongestMovers[0]?.symbol ?? "—"}</b></span><span>Bottom stock <b>{model.weakestMovers[0]?.symbol ?? "—"}</b></span><Link to={`/?lens=sector-matrix${sectorId ? `&sector=${sectorId}` : ""}`}>Back to Summary</Link></footer>
    <QuickView state={{ target: inspect, rect: anchorRect }} model={model} profiles={profiles.bySymbol} onClose={closeQuick} onSelectSector={(sector) => patchUrl({ inspect: null, sector: sector.id })} />
  </div>;
}

function FullBoardToolbar({ model, profiles, search, sort, metric, sectorId, filters, visibleCount, onPatch, onReset }: { model: NonNullable<ReturnType<typeof useTodayData>["model"]>; profiles: NonNullable<ReturnType<typeof useTodayData>["profiles"]["payload"]>["records"]; search: string; sort: FullBoardSort; metric: MetricLens; sectorId: string | null; filters: StockProfileFilters; visibleCount: number; onPatch: (changes: Record<string, string | null>) => void; onReset: () => void }) {
  const caps = [...new Set(profiles.map((profile) => profile.capBucket))];
  return <div className={styles.boardToolbar} aria-label="Full Market Board controls"><strong>{visibleCount} visible</strong><label className={styles.search}><Search size={14} /><input value={search} onChange={(event) => onPatch({ search: event.target.value || null })} placeholder="Search ticker or company" aria-label="Search stock" /></label><label>View<select value={metric} onChange={(event) => onPatch({ view: event.target.value })}><option value="price1d">Price 1D</option><option value="price5d">Price 5D</option><option value="volume">Volume</option><option value="rsi">RSI</option><option value="williams">Williams %R</option><option value="oiis">OIIS</option><option value="opportunity">30D Opportunity</option></select></label><label>Sort<select value={sort} onChange={(event) => onPatch({ sort: event.target.value === "stable" ? null : event.target.value })}><option value="stable">Stable Order</option><option value="rank">Current Rank</option><option value="move">% Move</option><option value="alphabetical">Alphabetical</option><option value="volume">Volume</option><option value="opportunity">OIIS / Opportunity</option><option value="anomaly">Anomaly</option></select></label><label>Universe<select value={filters.universe} onChange={(event) => onPatch({ universe: event.target.value === "ALL" ? null : event.target.value.toLowerCase() })}><option value="ALL">All covered</option><option value="FNO">NSE F&amp;O</option><option value="NIFTY50">NIFTY 50</option><option value="NIFTY100">NIFTY 100</option><option value="NIFTY250">LargeMidcap 250</option><option value="NIFTY500">NIFTY 500</option></select></label><label>Market cap<select value={filters.capBucket} onChange={(event) => onPatch({ marketCap: event.target.value === "ALL" ? null : event.target.value })}><option value="ALL">All caps</option>{caps.map((cap) => <option key={cap}>{cap}</option>)}</select></label><label>Sector<select value={sectorId ?? "all"} onChange={(event) => onPatch({ sector: event.target.value === "all" ? null : event.target.value })}><option value="all">All sectors</option>{model.sectors.map((sector) => <option key={sector.id} value={sector.id}>{sector.name}</option>)}</select></label><button type="button" onClick={onReset}><X size={13} /> Clear all</button></div>;
}

function metricValue(stock: Quote, lens: MetricLens) {
  if (lens === "price1d") return formatSignedPercent(stock.changePct);
  if (lens === "price5d") return formatSignedPercent(stock.change5d);
  if (lens === "volume") return stock.relativeVolume == null ? "—" : `${formatDecimal(stock.relativeVolume)}×`;
  if (lens === "rsi") return formatDecimal(stock.rsi);
  if (lens === "williams") return formatDecimal(stock.willr);
  if (lens === "oiis") return formatDecimal(stock.oiisScore);
  return formatDecimal(stock.opportunity30d);
}

function VirtualisedSectorBoard({ sectors, profiles, metric, onSector, onStock }: { sectors: TodaySector[]; profiles: ReturnType<typeof useTodayData>["profiles"]["bySymbol"]; metric: MetricLens; onSector: (sector: TodaySector, target: HTMLElement) => void; onStock: (stock: Quote, target: HTMLElement) => void }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({ width: 1200, height: 500, scrollTop: 0 });
  useEffect(() => {
    const node = viewportRef.current; if (!node) return;
    const update = () => setLayout((value) => ({ ...value, width: node.clientWidth, height: node.clientHeight, scrollTop: node.scrollTop }));
    update(); const observer = new ResizeObserver(update); observer.observe(node); node.addEventListener("scroll", update, { passive: true });
    return () => { observer.disconnect(); node.removeEventListener("scroll", update); };
  }, []);
  const geometry = useMemo(() => {
    const columns = Math.max(2, Math.floor((layout.width - 20) / 132)); let offset = 0;
    const groups = sectors.map((sector) => { const height = 32 + Math.ceil(sector.stocks.length / columns) * 48 + 8; const row = { sector, top: offset, height }; offset += height; return row; });
    return { groups, total: offset, columns };
  }, [layout.width, sectors]);
  const visible = geometry.groups.filter((group) => group.top + group.height >= layout.scrollTop - 220 && group.top <= layout.scrollTop + layout.height + 220);
  return <div ref={viewportRef} className={styles.boardViewport} tabIndex={0} aria-label="Sector-grouped stock board"><div className={styles.boardCanvas} style={{ height: geometry.total }}>{visible.map(({ sector, top, height }) => <section className={styles.sectorGroup} key={sector.id} style={{ top, height }}><button className={styles.sectorGroupHeader} onClick={(event) => onSector(sector, event.currentTarget)}><span><SectorIcon name={sector.name} /><b>{sector.name}</b><small>{sector.stocks.length} stocks</small></span><span>Rank #{sector.rank}</span><Move value={sector.movePct} /><span>{sector.breadth.advancing}/{sector.breadth.total}<BreadthBar breadth={sector.breadth} /></span></button><div className={styles.stockGrid} style={{ gridTemplateColumns: `repeat(${geometry.columns}, minmax(0, 1fr))` }}>{sector.stocks.map((stock) => <button type="button" className={styles.stockTile} data-state={stock.alert ? "alert" : stock.changePct > 0 ? "positive" : stock.changePct < 0 ? "negative" : "neutral"} key={stock.symbol} onClick={(event) => onStock(stock, event.currentTarget)} title={`${stock.name} · ${stock.timestamp ?? "as-of unavailable"}`}><StockLogo symbol={stock.symbol} profile={profiles.get(stock.symbol)} size={18} /><span><b>{stock.symbol}</b><small>{formatNumber(stock.last, { minimumFractionDigits: 2 })}</small></span><em>{metricValue(stock, metric)}</em>{stock.alert ? <i aria-label={`${stock.alert.severity} ${stock.alert.label}`}>!</i> : null}</button>)}</div></section>)}</div></div>;
}
