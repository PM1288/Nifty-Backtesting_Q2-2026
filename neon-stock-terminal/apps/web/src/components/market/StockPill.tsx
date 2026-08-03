import type { CSSProperties } from "react";
import type { Quote } from "../../lib/types";
import { fmtPct, fmtPrice, arrow } from "../../lib/format";
import { IndicatorMarkers } from "./IndicatorMarkers";
import styles from "./StockPill.module.css";

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
  onSelect
}: {
  stock: Quote;
  rankBadge?: string;
  compact?: boolean;
  onSelect?: (stock: Quote) => void;
}) {
  const dir = stock.changePct > 0 ? "up" : stock.changePct < 0 ? "down" : "flat";
  const glow = rsiState(stock.rsi);
  const pctMagnitude = Math.min(1, Math.abs(stock.changePct) / 5);
  const rankType = rankBadge?.startsWith("▲") ? "gainer" : rankBadge?.startsWith("▼") ? "loser" : undefined;
  const styleVars: Record<string, string> = {};

  if (dir === "up") {
    const g = Math.round(88 + pctMagnitude * 160);
    const b = Math.round(18 + pctMagnitude * 78);
    styleVars["--pill-bg"] = `rgb(0 ${g} ${b})`;
    styleVars["--pill-border"] = `rgb(0 ${Math.min(255, g + 34)} ${Math.min(255, b + 24)})`;
    styleVars["--pill-glow-alpha"] = (0.32 + pctMagnitude * 0.58).toFixed(3);
  } else if (dir === "down") {
    const r = Math.round(94 + pctMagnitude * 156);
    const b = Math.round(16 + pctMagnitude * 58);
    styleVars["--pill-bg"] = `rgb(${r} 0 ${b})`;
    styleVars["--pill-border"] = `rgb(${Math.min(255, r + 20)} 0 ${Math.min(255, b + 24)})`;
    styleVars["--pill-glow-alpha"] = (0.32 + pctMagnitude * 0.58).toFixed(3);
  } else {
    styleVars["--pill-bg"] = "rgb(24 24 24)";
    styleVars["--pill-border"] = "rgb(78 78 78)";
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
      data-clarity-unmask="true"
      onClick={() => onSelect?.(stock)}
      style={style}
    >
      <IndicatorMarkers rsi={stock.rsi} willr={stock.willr} />
      <span className={styles.symbolWrap}>
        <span className={styles.symbolText}>{stock.symbol}</span>
        {rankBadge ? (
          <span className={styles.rankBadge} data-rank-type={rankType}>
            {rankBadge}
          </span>
        ) : null}
      </span>
      <span className={styles.ltp}>{fmtPrice(stock.last)}</span>
      <span className={styles.pctInline}>
        <span className={styles.pctArrow}>{arrow(stock.changePct)}</span>
        <span className={styles.pctValue}>{fmtPct(stock.changePct)}</span>
      </span>
    </button>
  );
}
