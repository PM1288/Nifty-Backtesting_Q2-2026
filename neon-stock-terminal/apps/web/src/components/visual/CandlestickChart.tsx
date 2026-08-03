import { useEffect, useMemo, useRef } from "react";
import { useI18n } from "../../i18n/LocaleProvider";
import { formatNumber, formatTime } from "../../lib/format";
import type { Direction, IntradayBar } from "../../lib/types";
import styles from "./CandlestickChart.module.css";

type NormalizedBar = {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
};

type BollingerPoint = {
  upper: number | null;
  middle: number | null;
  lower: number | null;
};

function toNumberValue(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeBars(bars: IntradayBar[]) {
  return bars
    .map((bar) => {
      const open = toNumberValue(bar.o);
      const close = toNumberValue(bar.c);
      const high = toNumberValue(bar.h, Math.max(open, close));
      const low = toNumberValue(bar.l, Math.min(open, close));
      return {
        t: bar.t,
        o: open,
        h: Math.max(high, open, close),
        l: Math.min(low, open, close),
        c: close,
        v: Math.max(0, toNumberValue((bar as IntradayBar & { v?: unknown }).v, 0))
      };
    })
    .filter((bar) => Number.isFinite(bar.o) && Number.isFinite(bar.h) && Number.isFinite(bar.l) && Number.isFinite(bar.c));
}

function computeBollingerSeries(closes: number[], period = 20) {
  const output: BollingerPoint[] = [];
  for (let i = 0; i < closes.length; i += 1) {
    if (i + 1 < period) {
      output.push({ upper: null, middle: null, lower: null });
      continue;
    }

    const window = closes.slice(i + 1 - period, i + 1);
    const mean = window.reduce((sum, value) => sum + value, 0) / period;
    const variance = window.reduce((sum, value) => sum + (value - mean) ** 2, 0) / period;
    const sd = Math.sqrt(variance);
    output.push({
      upper: mean + 2 * sd,
      middle: mean,
      lower: mean - 2 * sd
    });
  }
  return output;
}

function readCssVar(name: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function getCanvasFont(language: "en" | "hi" | "mr", digits: "latn" | "deva", weight: number, size: number) {
  const family =
    language === "en" && digits === "latn"
      ? "'Inter Variable', sans-serif"
      : "'Hind', 'Noto Sans Devanagari', 'Inter Variable', sans-serif";
  return `${weight} ${size}px ${family}`;
}

function formatTimeLabel(value: string) {
  return formatTime(value);
}

function formatVolumeLabel(value: number) {
  if (!Number.isFinite(value)) return "0";
  return formatNumber(value, { notation: "compact", maximumFractionDigits: value >= 1_000 ? 1 : 0 });
}

function drawLegendItem(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  label: string,
  stroke: string,
  dashed = false,
  filled = false,
  font: string
) {
  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = stroke;
  ctx.fillStyle = stroke;
  if (dashed) ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + 18, y);
  ctx.stroke();
  if (filled) {
    ctx.fillRect(x + 5, y - 4, 8, 8);
  }
  ctx.restore();

  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.font = font;
  ctx.fillText(label, x + 24, y + 4);
  ctx.restore();
}

export function CandlestickChart({
  bars,
  direction,
  referenceLines = []
}: {
  bars: IntradayBar[];
  direction: Direction;
  referenceLines?: Array<{ label: string; value: number }>;
}) {
  const { digits, language, tr } = useI18n();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const normalizedBars = useMemo(() => normalizeBars(bars), [bars]);
  const bollinger = useMemo(() => computeBollingerSeries(normalizedBars.map((bar) => bar.c)), [normalizedBars]);
  const refs = useMemo(() => referenceLines.filter((line) => Number.isFinite(line.value)), [referenceLines]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const upColor = readCssVar("--green", "#00ff66");
    const downColor = readCssVar("--red", "#ff0033");
    const neutralColor = readCssVar("--white", "#ffffff");
    const gridColor = readCssVar("--w-08", "rgba(255,255,255,0.08)");
    const labelColor = readCssVar("--w-54", "rgba(255,255,255,0.54)");
    const textColor = readCssVar("--w-72", "rgba(255,255,255,0.72)");
    const accent = direction === "up" ? upColor : direction === "down" ? downColor : neutralColor;
    const labelFont = getCanvasFont(language, digits, 700, 10);
    const textFont = getCanvasFont(language, digits, 500, 10);
    const legendFont = getCanvasFont(language, digits, 500, 11);

    const resizeAndDraw = () => {
      const rect = wrap.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));
      const dpr = Math.min(2, window.devicePixelRatio || 1);

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, width, height);

      if (normalizedBars.length < 2) {
        return;
      }

      const left = 58;
      const right = width - 62;
      const headerHeight = 34;
      const top = 18 + headerHeight;
      const bottom = height - 32;
      const volumeHeight = Math.max(64, Math.floor(height * 0.22));
      const gap = 18;
      const priceTop = top;
      const priceBottom = Math.max(priceTop + 72, bottom - volumeHeight - gap);
      const volumeTop = priceBottom + gap;
      const volumeBottom = bottom;
      const priceHeight = Math.max(1, priceBottom - priceTop);
      const volumeHeightInner = Math.max(1, volumeBottom - volumeTop);

      const highs = normalizedBars.map((bar) => bar.h);
      const lows = normalizedBars.map((bar) => bar.l);
      for (const point of bollinger) {
        if (point.upper != null) highs.push(point.upper);
        if (point.lower != null) lows.push(point.lower);
      }
      for (const line of refs) {
        highs.push(line.value);
        lows.push(line.value);
      }

      const maxPrice = Math.max(...highs);
      const minPrice = Math.min(...lows);
      const priceSpan = Math.max(1e-9, maxPrice - minPrice);
      const maxVolume = Math.max(1, ...normalizedBars.map((bar) => bar.v));
      const xStep = (right - left) / normalizedBars.length;
      const bodyWidth = Math.max(2, Math.min(14, xStep * 0.62));

      const yFromPrice = (value: number) => priceTop + ((maxPrice - value) / priceSpan) * priceHeight;
      const yFromVolume = (value: number) => volumeBottom - (value / maxVolume) * volumeHeightInner;

      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.03)";
      ctx.fillRect(left, priceTop, right - left, priceHeight);
      ctx.fillRect(left, volumeTop, right - left, volumeHeightInner);
      ctx.restore();

      ctx.save();
      ctx.fillStyle = labelColor;
      ctx.font = labelFont;
      ctx.fillText(tr("Price (INR)"), left, 24);
      ctx.fillText(tr("Volume"), left, volumeTop - 6);
      ctx.restore();

      drawLegendItem(ctx, Math.max(left + 88, 180), 24, tr("Candles"), accent, false, true, legendFont);
      drawLegendItem(ctx, Math.max(left + 198, 290), 24, tr("Middle band"), neutralColor, false, false, legendFont);
      drawLegendItem(ctx, Math.max(left + 334, 430), 24, tr("Band range"), "rgba(255,255,255,0.48)", true, false, legendFont);
      if (refs.length) {
        drawLegendItem(ctx, Math.max(left + 462, 560), 24, tr("Reference"), "rgba(255,255,255,0.38)", true, false, legendFont);
      }

      ctx.save();
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 1;
      ctx.font = textFont;
      ctx.fillStyle = textColor;
      ctx.textAlign = "left";
      for (let i = 0; i <= 4; i += 1) {
        const y = priceTop + (priceHeight * i) / 4;
        const priceValue = maxPrice - (priceSpan * i) / 4;
        ctx.beginPath();
        ctx.moveTo(left, y);
        ctx.lineTo(right, y);
        ctx.stroke();
        ctx.fillText(formatNumber(priceValue, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), right + 8, y + 3);
      }

      for (let i = 0; i <= 2; i += 1) {
        const y = volumeTop + (volumeHeightInner * i) / 2;
        const volumeValue = maxVolume - (maxVolume * i) / 2;
        ctx.beginPath();
        ctx.moveTo(left, y);
        ctx.lineTo(right, y);
        ctx.stroke();
        ctx.fillText(formatVolumeLabel(volumeValue), right + 8, y + 3);
      }
      ctx.restore();

      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "rgba(255,255,255,0.45)";
      ctx.fillStyle = "rgba(255,255,255,0.82)";
      ctx.font = textFont;
      refs.forEach((line) => {
        const y = yFromPrice(line.value);
        ctx.beginPath();
        ctx.moveTo(left, y);
        ctx.lineTo(right, y);
        ctx.stroke();
        ctx.fillText(line.label, left + 4, Math.max(priceTop + 10, y - 4));
      });
      ctx.restore();

      const drawBand = (key: keyof BollingerPoint, stroke: string, lineWidth: number, dash: number[] = []) => {
        ctx.save();
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineWidth;
        ctx.setLineDash(dash);
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < normalizedBars.length; i += 1) {
          const value = bollinger[i]?.[key];
          if (value == null) continue;
          const x = left + i * xStep + xStep / 2;
          const y = yFromPrice(value);
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
        ctx.restore();
      };

      drawBand("upper", "rgba(255,255,255,0.48)", 1, [3, 3]);
      drawBand("middle", "rgba(255,255,255,0.9)", 1.2);
      drawBand("lower", "rgba(255,255,255,0.48)", 1, [3, 3]);

      ctx.save();
      ctx.lineWidth = 1;
      for (let i = 0; i < normalizedBars.length; i += 1) {
        const bar = normalizedBars[i]!;
        const x = left + i * xStep + xStep / 2;
        const openY = yFromPrice(bar.o);
        const closeY = yFromPrice(bar.c);
        const highY = yFromPrice(bar.h);
        const lowY = yFromPrice(bar.l);
        const isUp = bar.c >= bar.o;
        const candleColor = isUp ? upColor : downColor;

        ctx.strokeStyle = candleColor;
        ctx.fillStyle = candleColor;
        ctx.beginPath();
        ctx.moveTo(x, highY);
        ctx.lineTo(x, lowY);
        ctx.stroke();

        const topY = Math.min(openY, closeY);
        const bodyHeight = Math.max(1, Math.abs(closeY - openY));
        if (bodyHeight <= 1.2) {
          ctx.beginPath();
          ctx.moveTo(x - bodyWidth / 2, topY);
          ctx.lineTo(x + bodyWidth / 2, topY);
          ctx.stroke();
        } else {
          ctx.fillRect(x - bodyWidth / 2, topY, bodyWidth, bodyHeight);
        }

        const volumeY = yFromVolume(bar.v);
        ctx.fillStyle = isUp ? "rgba(0,255,102,0.5)" : "rgba(255,0,51,0.5)";
        ctx.fillRect(x - bodyWidth / 2, volumeY, bodyWidth, Math.max(1, volumeBottom - volumeY));
      }
      ctx.restore();

      ctx.save();
      ctx.strokeStyle = gridColor;
      ctx.fillStyle = textColor;
      ctx.font = textFont;
      ctx.textAlign = "center";
      const labelIndices = [0, Math.floor(normalizedBars.length * 0.25), Math.floor(normalizedBars.length * 0.5), Math.floor(normalizedBars.length * 0.75), normalizedBars.length - 1]
        .filter((index, position, list) => index >= 0 && list.indexOf(index) === position);
      for (const index of labelIndices) {
        const x = left + index * xStep + xStep / 2;
        ctx.beginPath();
        ctx.moveTo(x, priceTop);
        ctx.lineTo(x, volumeBottom);
        ctx.stroke();
        ctx.fillText(formatTimeLabel(normalizedBars[index]!.t), x, height - 10);
      }
      ctx.restore();
    };

    const observer = new ResizeObserver(() => resizeAndDraw());
    observer.observe(wrap);
    resizeAndDraw();

    return () => observer.disconnect();
  }, [digits, direction, language, normalizedBars, bollinger, refs, tr]);

  return (
    <div ref={wrapRef} className={styles.wrap} role="img" aria-label={tr("Intraday candlestick and volume chart")}>
      <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true">
        {tr("Intraday candlestick chart")}
      </canvas>
      {normalizedBars.length < 2 ? <div className={styles.empty}>{tr("Not enough data for candlestick view.")}</div> : null}
    </div>
  );
}
