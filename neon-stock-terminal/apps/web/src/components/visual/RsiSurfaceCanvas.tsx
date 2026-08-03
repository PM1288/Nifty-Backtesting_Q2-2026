import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../../i18n/LocaleProvider";
import { formatTime } from "../../lib/format";
import type { RsiSurfaceDrop } from "../../lib/types";
import styles from "./RsiSurfaceCanvas.module.css";

type RsiSurfaceCanvasProps = {
  timestamps: string[];
  symbols: string[];
  values: number[][];
  oversold: number;
  overbought: number;
  suddenDrops: RsiSurfaceDrop[];
};

type ColorStop = { at: number; color: [number, number, number] };

const COLOR_STOPS: ColorStop[] = [
  { at: 0, color: [24, 0, 0] },
  { at: 30, color: [122, 0, 0] },
  { at: 45, color: [255, 230, 0] },
  { at: 80, color: [0, 100, 0] },
  { at: 100, color: [0, 100, 0] }
];

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function colorForRsi(value: number): [number, number, number] {
  const clamped = Math.max(0, Math.min(100, value));
  for (let i = 0; i < COLOR_STOPS.length - 1; i += 1) {
    const start = COLOR_STOPS[i]!;
    const end = COLOR_STOPS[i + 1]!;
    if (clamped > end.at) continue;
    const span = Math.max(1e-6, end.at - start.at);
    const t = (clamped - start.at) / span;
    return [
      Math.round(mix(start.color[0], end.color[0], t)),
      Math.round(mix(start.color[1], end.color[1], t)),
      Math.round(mix(start.color[2], end.color[2], t))
    ];
  }
  return COLOR_STOPS[COLOR_STOPS.length - 1]!.color;
}

function getCanvasFont(language: "en" | "hi" | "mr", digits: "latn" | "deva", weight: number, size: number) {
  const family =
    language === "en" && digits === "latn"
      ? "'Inter Variable', sans-serif"
      : "'Hind', 'Noto Sans Devanagari', 'Inter Variable', sans-serif";
  return `${weight} ${size}px ${family}`;
}

function fmtTimeLabel(iso: string): string {
  return formatTime(iso);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function bilinear(z00: number, z10: number, z01: number, z11: number, tx: number, ty: number): number {
  const top = lerp(z00, z10, tx);
  const bottom = lerp(z01, z11, tx);
  return lerp(top, bottom, ty);
}

export function RsiSurfaceCanvas({
  timestamps,
  symbols,
  values,
  oversold,
  overbought,
  suddenDrops
}: RsiSurfaceCanvasProps) {
  const { digits, language, tr } = useI18n();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  const dropMap = useMemo(() => new Map(suddenDrops.map((drop) => [drop.symbol, drop])), [suddenDrops]);

  useEffect(() => {
    if (!wrapRef.current) return;
    const target = wrapRef.current;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize({
        width: Math.max(320, Math.floor(width)),
        height: Math.max(260, Math.floor(height))
      });
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width <= 0 || size.height <= 0) return;
    const rows = symbols.length;
    const cols = timestamps.length;
    if (!rows || !cols) {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "rgba(255,255,255,0.72)";
      ctx.font = getCanvasFont(language, digits, 600, 14);
      ctx.fillText(tr("No intraday RSI data available."), 18, 28);
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(size.width * dpr));
    canvas.height = Math.max(1, Math.floor(size.height * dpr));
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);
    ctx.imageSmoothingEnabled = true;

    const margin = 16;
    const centerX = size.width * 0.52;
    const centerY = size.height * 0.66;
    const plotWidth = size.width - margin * 2;
    const plotDepth = Math.max(180, size.height * 0.82);
    const plotHeight = Math.max(120, size.height * 0.54);
    const rotate = -0.84;
    const tilt = 0.46;

    const project = (xIdx: number, yIdx: number, rsi: number) => {
      const xNorm = cols > 1 ? xIdx / (cols - 1) - 0.5 : 0;
      const yNorm = rows > 1 ? yIdx / (rows - 1) - 0.5 : 0;
      const sx = xNorm * plotWidth;
      const sy = yNorm * plotDepth;
      const rx = sx * Math.cos(rotate) - sy * Math.sin(rotate);
      const ry = sx * Math.sin(rotate) + sy * Math.cos(rotate);
      const z = ((rsi - 50) / 50) * plotHeight;
      const perspective = 1 - ry / (plotDepth * 2.5);
      return {
        x: centerX + rx * perspective,
        y: centerY + ry * tilt - z,
        depth: ry
      };
    };

    const drawPlane = (level: number, stroke: string) => {
      ctx.save();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.1;
      ctx.globalAlpha = 0.52;

      const ySteps = Math.max(4, Math.floor(rows / 10));
      for (let y = 0; y < rows; y += ySteps) {
        ctx.beginPath();
        for (let x = 0; x < cols; x += 1) {
          const p = project(x, y, level);
          if (x === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      }

      const xSteps = Math.max(6, Math.floor(cols / 12));
      for (let x = 0; x < cols; x += xSteps) {
        ctx.beginPath();
        for (let y = 0; y < rows; y += 1) {
          const p = project(x, y, level);
          if (y === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      }
      ctx.restore();
    };

    const xResolution = cols > 90 ? 3 : 4;
    const yResolution = rows > 80 ? 2 : 3;
    const meshRows = (rows - 1) * yResolution;
    const meshCols = (cols - 1) * xResolution;

    for (let my = 0; my < meshRows; my += 1) {
      const baseY = Math.floor(my / yResolution);
      const nextY = Math.min(rows - 1, baseY + 1);
      const ty0 = (my % yResolution) / yResolution;
      const ty1 = (my + 1) % yResolution === 0 ? 1 : ((my + 1) % yResolution) / yResolution;
      const y0 = baseY + ty0;
      const y1 = baseY + ty1;

      for (let mx = 0; mx < meshCols; mx += 1) {
        const baseX = Math.floor(mx / xResolution);
        const nextX = Math.min(cols - 1, baseX + 1);
        const tx0 = (mx % xResolution) / xResolution;
        const tx1 = (mx + 1) % xResolution === 0 ? 1 : ((mx + 1) % xResolution) / xResolution;
        const x0 = baseX + tx0;
        const x1 = baseX + tx1;

        const z00 = values[baseY]?.[baseX] ?? 50;
        const z10 = values[baseY]?.[nextX] ?? z00;
        const z01 = values[nextY]?.[baseX] ?? z00;
        const z11 = values[nextY]?.[nextX] ?? z10;

        const q00 = bilinear(z00, z10, z01, z11, tx0, ty0);
        const q10 = bilinear(z00, z10, z01, z11, tx1, ty0);
        const q01 = bilinear(z00, z10, z01, z11, tx0, ty1);
        const q11 = bilinear(z00, z10, z01, z11, tx1, ty1);

        const p00 = project(x0, y0, q00);
        const p10 = project(x1, y0, q10);
        const p11 = project(x1, y1, q11);
        const p01 = project(x0, y1, q01);
        const zAvg = (q00 + q10 + q11 + q01) / 4;
        const [r, g, b] = colorForRsi(zAvg);

        ctx.beginPath();
        ctx.moveTo(p00.x, p00.y);
        ctx.lineTo(p10.x, p10.y);
        ctx.lineTo(p11.x, p11.y);
        ctx.lineTo(p01.x, p01.y);
        ctx.closePath();
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.9)`;
        ctx.fill();
      }
    }

    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 0.65;

    const ridgeStep = Math.max(3, Math.floor(rows / 18));
    for (let y = 0; y < rows; y += ridgeStep) {
      ctx.beginPath();
      for (let x = 0; x < cols; x += 1) {
        const p = project(x, y, values[y]?.[x] ?? 50);
        if (x === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
    ctx.restore();

    drawPlane(oversold, "rgba(255,0,51,0.78)");
    drawPlane(overbought, "rgba(0,255,102,0.78)");

    const latestX = cols - 1;
    for (let y = 0; y < rows; y += 1) {
      const symbol = symbols[y]!;
      const rsi = values[y]?.[latestX] ?? 50;
      const p = project(latestX, y, rsi);
      const [r, g, b] = colorForRsi(rsi);
      const drop = dropMap.get(symbol);
      const isHighDrop = drop?.severity === "high";
      const radius = isHighDrop ? 4.5 : drop ? 3.6 : 2.8;

      if (drop) {
        ctx.beginPath();
        ctx.fillStyle = "rgba(255,0,51,0.16)";
        ctx.arc(p.x, p.y, radius + 3.8, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.beginPath();
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 1)`;
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.68)";
      ctx.lineWidth = 0.95;
      ctx.stroke();
    }

    const first = project(0, 0, 0);
    const mid = project(Math.floor((cols - 1) / 2), 0, 0);
    const last = project(cols - 1, 0, 0);
    const plane30 = project(cols - 1, rows - 1, oversold);
    const plane70 = project(cols - 1, rows - 1, overbought);

    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = getCanvasFont(language, digits, 600, 11);
    ctx.fillText(fmtTimeLabel(timestamps[0]!), first.x - 12, first.y + 16);
    ctx.fillText(fmtTimeLabel(timestamps[Math.floor((timestamps.length - 1) / 2)]!), mid.x - 14, mid.y + 16);
    ctx.fillText(fmtTimeLabel(timestamps[timestamps.length - 1]!), last.x - 14, last.y + 16);
    ctx.fillStyle = "rgba(255,0,51,0.94)";
    ctx.fillText("RSI 30", plane30.x + 8, plane30.y + 2);
    ctx.fillStyle = "rgba(0,255,102,0.94)";
    ctx.fillText("RSI 70", plane70.x + 8, plane70.y + 2);
    ctx.restore();
  }, [digits, dropMap, language, overbought, oversold, size.height, size.width, symbols, timestamps, tr, values]);

  return (
    <div className={styles.wrap} ref={wrapRef} role="img" aria-label={tr("3D RSI surface across stocks and time")}>
      <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true">
        {tr("3D RSI surface")}
      </canvas>
    </div>
  );
}
