import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../../i18n/LocaleProvider";
import { formatNumber, formatTime } from "../../lib/format";
import type { RsiSurfaceResponse } from "../../lib/types";
import { getHeatmapColor } from "./heatmapSemantics";
import styles from "./RsiHeatmap.module.css";

type Props = {
  payload: RsiSurfaceResponse;
  selectedSymbol?: string | null;
  onSelectSymbol?: (symbol: string) => void;
};

const TOP_GUTTER = 34;
const ROW_HEIGHT = 10;
const SYMBOL_COL = 106;
const RSI_COL = 54;
const LABEL_GUTTER_TOTAL = SYMBOL_COL + RSI_COL + 16;
const ANIMATION_MS = 720;

type AnimatedSnapshot = {
  index: number;
  latestRsi: number;
  values: number[];
};

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function getCanvasFont(language: "en" | "hi" | "mr", digits: "latn" | "deva", weight: number, size: number) {
  const family =
    language === "en" && digits === "latn"
      ? "'IBM Plex Mono', 'Inter Variable', sans-serif"
      : "'Hind', 'Noto Sans Devanagari', 'Inter Variable', sans-serif";
  return `${weight} ${size}px ${family}`;
}

function fmtTimeLabel(iso: string): string {
  return formatTime(iso);
}

export function RsiHeatmap({ payload, selectedSymbol, onSelectSymbol }: Props) {
  const { digits, language, tr } = useI18n();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [width, setWidth] = useState(0);
  const [animProgress, setAnimProgress] = useState(1);
  const previousSnapshotRef = useRef<Map<string, AnimatedSnapshot>>(new Map());
  const animationFrameRef = useRef<number | null>(null);
  const orderedRows = useMemo(
    () =>
      payload.rows
        .map((row, index) => ({
          row,
          values: payload.values[index] ?? []
        }))
        .sort((a, b) => b.row.latestRsi - a.row.latestRsi),
    [payload.rows, payload.values]
  );
  const currentSnapshot = useMemo(() => {
    const next = new Map<string, AnimatedSnapshot>();
    orderedRows.forEach((entry, index) => {
      next.set(entry.row.symbol, {
        index,
        latestRsi: entry.row.latestRsi,
        values: entry.values
      });
    });
    return next;
  }, [orderedRows]);

  const layout = useMemo(() => {
    let cursorY = TOP_GUTTER;
    const rows = orderedRows.map((entry) => {
      const y = cursorY;
      cursorY += ROW_HEIGHT;
      return { ...entry, y };
    });
    return {
      rows,
      totalHeight: cursorY + 12
    };
  }, [orderedRows]);

  useEffect(() => {
    if (!wrapRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setWidth(Math.max(640, Math.floor(entry.contentRect.width)));
    });
    observer.observe(wrapRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const previous = previousSnapshotRef.current;
    if (previous.size === 0) {
      previousSnapshotRef.current = currentSnapshot;
      setAnimProgress(1);
      return;
    }

    if (animationFrameRef.current) {
      window.cancelAnimationFrame(animationFrameRef.current);
    }

    setAnimProgress(0);
    const startedAt = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startedAt;
      const progress = Math.min(1, elapsed / ANIMATION_MS);
      setAnimProgress(progress);
      if (progress < 1) {
        animationFrameRef.current = window.requestAnimationFrame(tick);
      } else {
        previousSnapshotRef.current = currentSnapshot;
        animationFrameRef.current = null;
      }
    };

    animationFrameRef.current = window.requestAnimationFrame(tick);

    return () => {
      if (animationFrameRef.current) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [currentSnapshot]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0) return;

    const dpr = window.devicePixelRatio || 1;
    const height = layout.totalHeight;
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const heatmapWidth = width - LABEL_GUTTER_TOTAL - 14;
    const colWidth = Math.max(1, heatmapWidth / Math.max(1, payload.timestamps.length));
    const ease = 1 - Math.pow(1 - animProgress, 3);
    const previousSnapshot = previousSnapshotRef.current;
    const headingFont = getCanvasFont(language, digits, 700, 11);
    const bodyFont = getCanvasFont(language, digits, 600, 10);

    ctx.fillStyle = "rgba(0, 0, 0, 0.72)";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
    ctx.fillRect(LABEL_GUTTER_TOTAL, TOP_GUTTER - 8, heatmapWidth, height - TOP_GUTTER);

    const labelIndices = [0, 75, 150, 225, 300, payload.timestamps.length - 1].filter(
      (value, index, list) => value >= 0 && list.indexOf(value) === index
    );

    ctx.save();
    ctx.font = getCanvasFont(language, digits, 600, 11);
    ctx.fillStyle = "rgba(255,255,255,0.78)";
    ctx.textAlign = "center";
    for (const idx of labelIndices) {
      const xBase = LABEL_GUTTER_TOTAL + idx * colWidth + colWidth * 0.5;
      ctx.fillText(fmtTimeLabel(payload.timestamps[idx]!), xBase, 18);
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(xBase, TOP_GUTTER - 4);
      ctx.lineTo(xBase, height - 8);
      ctx.stroke();
    }
    ctx.restore();

    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(LABEL_GUTTER_TOTAL - 8, TOP_GUTTER - 6);
    ctx.lineTo(width - 8, TOP_GUTTER - 6);
    ctx.stroke();

    ctx.save();
    ctx.font = headingFont;
    ctx.fillStyle = "rgba(255,255,255,0.82)";
    ctx.textAlign = "left";
    ctx.fillText(tr("Stock"), 10, 18);
    ctx.fillText("RSI", SYMBOL_COL + 8, 18);
    ctx.restore();

    layout.rows.forEach(({ row, values, y }, targetIndex) => {
      const previous = previousSnapshot.get(row.symbol);
      const startIndex = previous?.index ?? targetIndex;
      const animatedY = mix(TOP_GUTTER + startIndex * ROW_HEIGHT, y, ease);
      const latestRsi = mix(previous?.latestRsi ?? row.latestRsi, row.latestRsi, ease);
      const currentTone = getHeatmapColor("rsi", latestRsi);
      ctx.font = bodyFont;
      ctx.fillStyle = currentTone;
      ctx.fillText(row.symbol, 10, animatedY + 8);
      ctx.fillText(formatNumber(latestRsi, { minimumFractionDigits: 1, maximumFractionDigits: 1 }), SYMBOL_COL + 8, animatedY + 8);

      for (let col = 0; col < values.length; col += 1) {
        const prevValue = previous?.values[col] ?? values[col] ?? 50;
        const nextValue = values[col] ?? 50;
        const animatedValue = mix(prevValue, nextValue, ease);
        ctx.fillStyle = getHeatmapColor("rsi", animatedValue);
        ctx.fillRect(
          LABEL_GUTTER_TOTAL + col * colWidth,
          animatedY,
          Math.ceil(colWidth) + 0.5,
          ROW_HEIGHT - 1
        );
      }

      if (previous && Math.abs(previous.latestRsi - row.latestRsi) > 0.8 && animProgress < 1) {
        ctx.strokeStyle = row.latestRsi >= previous.latestRsi ? "rgba(0,255,102,0.55)" : "rgba(255,0,51,0.55)";
        ctx.lineWidth = 1;
        ctx.strokeRect(6, animatedY - 1, width - 14, ROW_HEIGHT);
      }

      if (selectedSymbol === row.symbol) {
        ctx.strokeStyle = "rgba(212, 175, 55, 0.92)";
        ctx.lineWidth = 1.2;
        ctx.strokeRect(6, animatedY - 1, width - 14, ROW_HEIGHT);
      }

      ctx.strokeStyle = "rgba(255,255,255,0.04)";
      ctx.beginPath();
      ctx.moveTo(8, animatedY + ROW_HEIGHT);
      ctx.lineTo(width - 8, animatedY + ROW_HEIGHT);
      ctx.stroke();
    });
  }, [animProgress, layout, payload.timestamps, selectedSymbol, width]);

  const resolveSymbolFromPointer = (clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const localY = clientY - rect.top;
    const match = layout.rows.find(({ y }) => localY >= y && localY <= y + ROW_HEIGHT);
    return match?.row.symbol ?? null;
  };

  return (
    <div
      className={styles.wrap}
      ref={wrapRef}
      role="img"
      aria-label={tr("Intraday RSI heatmap by stock and time")}
      data-clarity-unmask="true"
      onMouseMove={(event) => {
        const symbol = resolveSymbolFromPointer(event.clientY);
        if (symbol) onSelectSymbol?.(symbol);
      }}
      onClick={(event) => {
        const symbol = resolveSymbolFromPointer(event.clientY);
        if (symbol) onSelectSymbol?.(symbol);
      }}
    >
      <div className={styles.scroll}>
        <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true">
          {tr("Intraday RSI heatmap")}
        </canvas>
      </div>
    </div>
  );
}
