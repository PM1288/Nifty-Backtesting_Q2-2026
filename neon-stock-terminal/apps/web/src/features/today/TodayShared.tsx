import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import {
  ArrowDown, ArrowUp, BriefcaseBusiness, Building2, CarFront, CircleDot,
  Cpu, Droplets, Factory, FlaskConical, HardHat, HeartPulse, Info, Landmark, Minus,
  Pickaxe, RadioTower, ShoppingBasket, ShoppingCart, TriangleAlert, X, Zap,
} from "lucide-react";
import { StockLogo } from "../../components/stocks/StockProfileControls";
import { formatDecimal, formatNumber, formatWholeNumber } from "../../lib/format";
import { useStock } from "../../lib/hooks";
import type { Quote } from "../../lib/types";
import type { StockProfile } from "../../lib/stockProfiles";
import { movementState, type QuickViewTarget, type TodayBreadth, type TodayModel, type TodaySector } from "./todayModel";
import { formatSignedPercent } from "./todayFormat";
import styles from "./Today.module.css";

export function Move({ value }: { value: number | null | undefined }) {
  const state = movementState(value);
  const Icon = state === "positive" ? ArrowUp : state === "negative" ? ArrowDown : Minus;
  return <span className={styles.move} data-state={state}><Icon size={12} aria-hidden="true" /><span>{formatSignedPercent(value)}</span></span>;
}

const sectorIcons: Array<[RegExp, typeof Cpu]> = [
  [/information|technology|it services/i, Cpu], [/financial|bank/i, Landmark], [/metal|mining/i, Pickaxe],
  [/chemical/i, FlaskConical], [/oil|gas|fuel/i, Droplets], [/automobile|auto/i, CarFront],
  [/capital goods|industrial/i, Factory], [/power|energy/i, Zap], [/telecom/i, RadioTower],
  [/realty|real estate/i, Building2], [/construction/i, HardHat], [/health|pharma/i, HeartPulse],
  [/consumer service/i, ShoppingCart], [/fmcg|agri|food/i, ShoppingBasket], [/service/i, BriefcaseBusiness],
];

export function SectorIcon({ name, size = 15 }: { name: string; size?: number }) {
  const Icon = sectorIcons.find(([pattern]) => pattern.test(name))?.[1] ?? CircleDot;
  return <Icon size={size} aria-hidden="true" />;
}

export function BreadthBar({ breadth }: { breadth: TodayBreadth }) {
  const denominator = Math.max(1, breadth.total);
  return <span className={styles.breadthBar} role="img" aria-label={`${breadth.advancing} advancing, ${breadth.declining} declining, ${breadth.neutral} unchanged`}>
    <i data-kind="up" style={{ width: `${breadth.advancing / denominator * 100}%` }} />
    <i data-kind="down" style={{ width: `${breadth.declining / denominator * 100}%` }} />
    <i data-kind="flat" style={{ width: `${breadth.neutral / denominator * 100}%` }} />
  </span>;
}

export function MarketSummaryStrip({ model, compact = false }: { model: TodayModel; compact?: boolean }) {
  const indexCards = [model.indices.nifty50, model.indices.bankNifty, model.indices.indiaVix];
  return <section className={styles.marketStrip} data-compact={compact ? "true" : "false"} aria-label="Current market summary" tabIndex={0}>
    {indexCards.map((quote) => <article className={styles.indexCard} key={quote.symbol} data-state={movementState(quote.changePct)} title={`As of ${quote.timestamp ?? model.asOf ?? "unavailable"}`}>
      <header><strong>{quote.name || quote.symbol}</strong><Move value={quote.changePct} /></header>
      <b>{formatNumber(quote.last, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
      <span className={styles.sparkUnavailable}>Intraday path —</span>
    </article>)}
    <article className={styles.indexCard}><header><strong>BREADTH</strong><Info size={12} aria-hidden="true" /></header><b>{model.breadth.advancing} / {model.breadth.declining} / {model.breadth.neutral}</b><BreadthBar breadth={model.breadth} /><span>Advance / decline / unchanged</span></article>
    <article className={styles.indexCard}><header><strong>MARKET REGIME</strong><Info size={12} aria-hidden="true" /></header><b>Not classified</b><span>Canonical regime is not supplied by the Today snapshot.</span></article>
  </section>;
}

export function StockRow({ stock, profile, onOpen, score }: { stock: Quote; profile?: StockProfile; onOpen: (stock: Quote, target: HTMLElement) => void; score?: number | null }) {
  return <button type="button" className={styles.stockRow} onClick={(event) => onOpen(stock, event.currentTarget)}>
    <StockLogo symbol={stock.symbol} profile={profile} size={16} /><strong>{stock.symbol}</strong><span>{formatNumber(stock.last, { minimumFractionDigits: 2 })}</span><Move value={stock.changePct} />{score != null ? <em>{formatDecimal(score)}</em> : null}
  </button>;
}

function MiniChart({ points }: { points: Array<{ t: string; c: number }> }) {
  if (points.length < 2) return <div className={styles.chartEmpty}>Intraday series unavailable</div>;
  const values = points.map((point) => point.c);
  const min = Math.min(...values); const max = Math.max(...values); const span = Math.max(max - min, 1e-9);
  const path = points.map((point, index) => `${index ? "L" : "M"}${index / (points.length - 1) * 320},${72 - (point.c - min) / span * 64}`).join(" ");
  return <svg className={styles.miniChart} viewBox="0 0 320 80" role="img" aria-label={`Intraday price from ${formatDecimal(values[0])} to ${formatDecimal(values.at(-1))}`}><path d={path} /></svg>;
}

export type QuickViewState = { target: QuickViewTarget; rect: DOMRect | null };

export function QuickView({ state, model, profiles, onClose, onSelectSector }: { state: QuickViewState; model: TodayModel; profiles: Map<string, StockProfile>; onClose: () => void; onSelectSector: (sector: TodaySector) => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const stockSymbol = state.target?.type === "stock" ? state.target.symbol : null;
  const sectorId = state.target?.type === "sector" ? state.target.id : null;
  const stock = stockSymbol ? model.allStocks.find((item) => item.symbol === stockSymbol) ?? null : null;
  const sector = sectorId ? model.sectors.find((item) => item.id === sectorId) ?? null : null;
  const stockQuery = useStock(stock?.symbol ?? "", "1D", Boolean(stock));
  useEffect(() => {
    if (!state.target) return;
    closeRef.current?.focus();
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close);
  }, [state.target, onClose]);
  if (!state.target || (!stock && !sector)) return null;
  const left = Math.min(Math.max(8, state.rect?.left ?? innerWidth / 2 - 210), Math.max(8, innerWidth - 468));
  const top = Math.min(Math.max(84, (state.rect?.bottom ?? 100) + 8), Math.max(84, innerHeight - 520));
  return createPortal(<><button className={styles.popoverDismiss} aria-label="Close quick view" onClick={onClose} /><aside className={styles.quickView} style={{ left, top }} role="dialog" aria-label={stock ? `${stock.symbol} quick view` : `${sector?.name} quick view`}>
    <button ref={closeRef} type="button" className={styles.quickClose} onClick={onClose} aria-label="Close"><X size={16} /></button>
    {stock ? <>
      <header className={styles.quickHeader}><StockLogo symbol={stock.symbol} profile={profiles.get(stock.symbol)} size={30} /><div><strong>{stock.symbol}</strong><span>{stock.name}</span><small>{stock.sector ?? "Sector unavailable"}</small></div></header>
      <div className={styles.quickPrice}><b>{formatNumber(stock.last, { minimumFractionDigits: 2 })}</b><Move value={stock.changePct} /></div>
      <MiniChart points={stockQuery.data?.intraday ?? []} />
      <dl className={styles.factGrid}><div><dt>Open</dt><dd>{formatNumber(stock.dayOpen, { minimumFractionDigits: 2 })}</dd></div><div><dt>High</dt><dd>{formatNumber(stock.dayHigh, { minimumFractionDigits: 2 })}</dd></div><div><dt>Low</dt><dd>{formatNumber(stock.dayLow, { minimumFractionDigits: 2 })}</dd></div><div><dt>Volume</dt><dd>{typeof stock.volume === "number" ? formatWholeNumber(stock.volume) : stock.volume ?? "—"}</dd></div><div><dt>RSI</dt><dd>{formatDecimal(stock.rsi)}</dd></div><div><dt>Williams %R</dt><dd>{formatDecimal(stock.willr)}</dd></div><div><dt>OIIS</dt><dd>{formatDecimal(stock.oiisScore)}</dd></div><div><dt>30D opportunity</dt><dd>{formatDecimal(stock.opportunity30d)}</dd></div></dl>
      <footer><Link to={`/analytics/stock/${encodeURIComponent(stock.symbol)}`}>Open Stock 360</Link>{stock.alert ? <Link to="/options/intelligence">Open F&amp;O Radar</Link> : null}</footer>
    </> : sector ? <>
      <header className={styles.quickHeader}><SectorIcon name={sector.name} size={28} /><div><strong>#{sector.rank} {sector.name}</strong><span>Rank change unavailable</span><small>As of {model.asOf ?? "—"}</small></div></header>
      <div className={styles.quickPrice}><Move value={sector.movePct} /><span>{sector.breadth.advancing} advancing · {sector.breadth.declining} declining</span></div><BreadthBar breadth={sector.breadth} />
      <div className={styles.quickPair}>{sector.strongestStock ? <StockRow stock={sector.strongestStock} profile={profiles.get(sector.strongestStock.symbol)} onOpen={() => undefined} /> : null}{sector.weakestStock ? <StockRow stock={sector.weakestStock} profile={profiles.get(sector.weakestStock.symbol)} onOpen={() => undefined} /> : null}</div>
      <div className={styles.chartEmpty}>Sector intraday series unavailable</div>
      <footer><button type="button" onClick={() => onSelectSector(sector)}>Open Sector Matrix</button><Link to={`/full-board?sector=${sector.id}`}>View sector stocks</Link></footer>
    </> : null}
  </aside></>, document.body);
}

export function PanelState({ loading, error }: { loading: boolean; error: unknown }) {
  if (loading) return <div className={styles.pageState}>Loading current market evidence…</div>;
  if (error) return <div className={styles.pageState} data-error="true"><TriangleAlert size={18} /> Today data failed to load. Other routes remain available.</div>;
  return null;
}
