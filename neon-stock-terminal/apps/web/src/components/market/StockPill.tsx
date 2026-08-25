import type { CSSProperties } from "react";
import type { Quote } from "../../lib/types";
import { fmtPct, fmtPrice, arrow } from "../../lib/format";
import { IndicatorMarkers } from "./IndicatorMarkers";
import { StockPixelField } from "./StockPixelField";
import { StockLogo } from "../stocks/StockProfileControls";
import type { StockProfile } from "../../lib/stockProfiles";
import styles from "./StockPill.module.css";

export type StockLens = "price1d" | "price5d" | "volume" | "rsi" | "williams" | "oiis" | "opportunity";

function lensMetric(stock: Quote, lens: StockLens) {
  switch (lens) {
    case "price5d": return stock.change5d == null ? "—" : fmtPct(stock.change5d);
    case "volume": return stock.relativeVolume == null ? "—" : `${stock.relativeVolume.toFixed(2)}×`;
    case "rsi": return stock.rsi == null ? "—" : `RSI ${Math.round(stock.rsi)}`;
    case "williams": return stock.willr == null ? "—" : `W ${Math.round(stock.willr)}`;
    case "oiis": return stock.oiisScore == null ? "—" : `O ${Math.round(stock.oiisScore)}`;
    case "opportunity": return stock.opportunity30d == null ? "—" : `UP ${stock.opportunity30d.toFixed(1)}%`;
    default: return fmtPct(stock.changePct);
  }
}

function lensState(stock: Quote, lens: StockLens): "positive" | "negative" | "high" | "medium" | "neutral" | "missing" {
  const value = lens === "price5d" ? stock.change5d
    : lens === "volume" ? stock.relativeVolume
      : lens === "rsi" ? stock.rsi
        : lens === "williams" ? stock.willr
          : lens === "oiis" ? stock.oiisScore
            : lens === "opportunity" ? stock.opportunity30d
              : stock.changePct;
  if (value == null || !Number.isFinite(value)) return "missing";
  if (lens === "price1d" || lens === "price5d") return value > 0 ? "positive" : value < 0 ? "negative" : "neutral";
  if (lens === "volume") return value >= 2 ? "high" : value >= 1.25 ? "medium" : "neutral";
  if (lens === "rsi") return value >= 70 ? "high" : value <= 30 ? "negative" : value >= 55 ? "positive" : "neutral";
  if (lens === "williams") return value >= -20 ? "high" : value <= -80 ? "negative" : "neutral";
  if (lens === "oiis") return value > 70 ? "high" : value > 50 ? "medium" : "neutral";
  return value >= 5 ? "high" : value >= 1 ? "positive" : value < 0 ? "negative" : "neutral";
}

function rsiState(rsi: number | null | undefined): { state: "none" | "oversold" | "overbought"; intensity: number } {
  if (rsi == null || !Number.isFinite(rsi)) return { state: "none", intensity: 0 };
  if (rsi < 30) return { state: "oversold", intensity: Math.min(1, (30 - rsi) / 30) };
  if (rsi > 70) return { state: "overbought", intensity: Math.min(1, (rsi - 70) / 30) };
  return { state: "none", intensity: 0 };
}

export function StockPill({
  stock,
  rankBadge,
  compact,
  lens = "price1d",
  onSelect,
  profile
}: {
  stock: Quote;
  rankBadge?: string;
  compact?: boolean;
  lens?: StockLens;
  onSelect?: (stock: Quote) => void;
  profile?: StockProfile;
}) {
  const dir = stock.changePct > 0 ? "up" : stock.changePct < 0 ? "down" : "flat";
  const glow = rsiState(stock.rsi);
  const pctMagnitude = Math.min(1, Math.abs(stock.changePct) / 5);
  const rankType = rankBadge?.startsWith("▲") ? "gainer" : rankBadge?.startsWith("▼") ? "loser" : undefined;
  const metricState = lensState(stock, lens);
  const priorityBadge = stock.alert ? "alert" : stock.oiisSelected ? "oiis" : rankBadge ? "rank" : null;
  const styleVars: Record<string, string> = {};

  if (dir === "up") {
    const g = Math.round(88 + pctMagnitude * 160);
    const b = Math.round(18 + pctMagnitude * 78);
    styleVars["--pill-bg"] = `rgb(0 ${g} ${b})`;
    styleVars["--pill-border"] = `rgb(0 ${Math.min(255, g + 34)} ${Math.min(255, b + 24)})`;
    styleVars["--pill-glow-alpha"] = (0.32 + pctMagnitude * 0.58).toFixed(3);
    styleVars["--pill-fg"] = g > 180 ? "#052e1d" : "#ffffff";
  } else if (dir === "down") {
    const r = Math.round(94 + pctMagnitude * 156);
    const b = Math.round(16 + pctMagnitude * 58);
    styleVars["--pill-bg"] = `rgb(${r} 0 ${b})`;
    styleVars["--pill-border"] = `rgb(${Math.min(255, r + 20)} 0 ${Math.min(255, b + 24)})`;
    styleVars["--pill-glow-alpha"] = (0.32 + pctMagnitude * 0.58).toFixed(3);
    styleVars["--pill-fg"] = "#ffffff";
  } else {
    styleVars["--pill-bg"] = "rgb(24 24 24)";
    styleVars["--pill-border"] = "rgb(78 78 78)";
    styleVars["--pill-fg"] = "#ffffff";
  }

  if (glow.intensity > 0) {
    styleVars["--rsi-glow-alpha"] = String(0.15 + glow.intensity * 0.7);
  }

  const style: CSSProperties = styleVars as CSSProperties;

  return (
    <button
      type="button"
      className={styles.pill}
      data-dir={dir}
      data-rsi={glow.state}
      data-compact={compact ? "true" : "false"}
      data-stock-pill-symbol={stock.symbol}
      data-oiis-selected={stock.oiisSelected ? "true" : "false"}
      data-alert={stock.alert?.severity?.toLowerCase() ?? "none"}
      data-lens={lens}
      data-lens-state={metricState}
      data-clarity-unmask="true"
      title={stock.alert ? `${stock.symbol}: ${stock.alert.label}` : stock.oiisSelected ? `${stock.symbol}: OIIS ${stock.oiisState ?? "selected"}` : stock.symbol}
      onClick={() => onSelect?.(stock)}
      style={style}
    >
      <StockPixelField symbol={stock.symbol} tone={metricState} />
      <IndicatorMarkers rsi={stock.rsi} willr={stock.willr} />
      <span className={styles.symbolWrap}>
        <StockLogo symbol={stock.symbol} profile={profile} size={20} />
        <span className={styles.symbolText}>{stock.symbol}</span>
        {priorityBadge === "oiis" ? <span className={styles.oiisBadge}>OIIS</span> : null}
        {priorityBadge === "alert" ? <span className={styles.alertBadge} data-severity={stock.alert?.severity.toLowerCase()}>!</span> : null}
        {priorityBadge === "rank" && rankBadge ? (
          <span className={styles.rankBadge} data-rank-type={rankType}>
            {rankBadge}
          </span>
        ) : null}
      </span>
      <span className={styles.ltp}>{fmtPrice(stock.last)}</span>
      <span className={styles.pctInline}>
        <span className={styles.pctArrow}>{arrow(stock.changePct)}</span>
        <span className={styles.pctValue}>{lensMetric(stock, lens)}</span>
      </span>
    </button>
  );
}
