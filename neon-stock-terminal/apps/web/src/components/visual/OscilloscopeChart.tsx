import { useEffect, useMemo, useRef } from "react";
import { useI18n } from "../../i18n/LocaleProvider";
import type { Direction, IntradayBar } from "../../lib/types";
import styles from "./OscilloscopeChart.module.css";

function getAccent(direction: Direction): string {
  const root = getComputedStyle(document.documentElement);
  if (direction === "up") return root.getPropertyValue("--green").trim() || "#00ff66";
  if (direction === "down") return root.getPropertyValue("--red").trim() || "#ff0033";
  return root.getPropertyValue("--white").trim() || "#ffffff";
}

function getGrid(): string {
  const root = getComputedStyle(document.documentElement);
  return root.getPropertyValue("--w-08").trim() || "rgba(255,255,255,0.08)";
}

export function OscilloscopeChart({
  direction,
  bars,
  referenceLines = []
}: {
  direction: Direction;
  bars: IntradayBar[];
  referenceLines?: Array<{ label: string; value: number }>;
}) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const closes = useMemo(() => bars.map((b) => b.c), [bars]);
  const refs = useMemo(
    () => referenceLines.filter((r) => Number.isFinite(r.value)),
    [referenceLines]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const canvasEl = canvas;
    const wrapEl = wrap;
    const context = ctx;

    const accent = getAccent(direction);
    const grid = getGrid();

    let raf = 0;
    let w = 0;
    let h = 0;

    function resize() {
      const rect = wrapEl.getBoundingClientRect();
      w = Math.max(1, Math.floor(rect.width));
      h = Math.max(1, Math.floor(rect.height));
      const dpr = Math.min(2, window.devicePixelRatio || 1);

      canvasEl.width = Math.floor(w * dpr);
      canvasEl.height = Math.floor(h * dpr);
      canvasEl.style.width = `${w}px`;
      canvasEl.style.height = `${h}px`;

      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    const ro = new ResizeObserver(resize);
    ro.observe(wrapEl);
    resize();

    function drawGrid() {
      context.save();
      context.strokeStyle = grid;
      context.lineWidth = 1;

      const cols = 8;
      const rows = 4;

      for (let i = 1; i < cols; i++) {
        const x = (w * i) / cols;
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, h);
        context.stroke();
      }

      for (let j = 1; j < rows; j++) {
        const y = (h * j) / rows;
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(w, y);
        context.stroke();
      }

      context.restore();
    }

    let phase = 0;

    function frame() {
      // Fade out previous frame (trailing effect)
      context.fillStyle = "rgba(0,0,0,0.18)";
      context.fillRect(0, 0, w, h);

      drawGrid();

      if (closes.length >= 2) {
        const allValues = [...closes, ...refs.map((r) => r.value)];
        const min = Math.min(...allValues);
        const max = Math.max(...allValues);
        const span = Math.max(1e-9, max - min);

        // Oscilloscope wobble (subtle)
        phase += 0.02;
        const wobble = Math.sin(phase) * 0.8;

        context.save();
        context.strokeStyle = "rgba(255,255,255,0.32)";
        context.fillStyle = "rgba(255,255,255,0.68)";
        context.lineWidth = 1;
        context.setLineDash([4, 4]);
        context.font = "10px 'Hoover', sans-serif";
        refs.forEach((line) => {
          const yNorm = (line.value - min) / span;
          const y = (1 - yNorm) * (h - 24) + 12;
          context.beginPath();
          context.moveTo(8, y);
          context.lineTo(w - 8, y);
          context.stroke();
          context.fillText(line.label, 10, Math.max(10, y - 4));
        });
        context.restore();

        context.save();
        context.strokeStyle = accent;
        context.lineWidth = 2;
        context.shadowColor = accent;
        context.shadowBlur = 10;

        context.beginPath();
        closes.forEach((v, i) => {
          const x = (i / (closes.length - 1)) * (w - 16) + 8;
          const yNorm = (v - min) / span;
          const y = (1 - yNorm) * (h - 24) + 12 + wobble;
          if (i === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        });
        context.stroke();
        context.restore();
      }

      raf = requestAnimationFrame(frame);
    }

    // Init paint
    context.fillStyle = "#000000";
    context.fillRect(0, 0, w, h);
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [direction, closes, refs]);

  return (
    <div ref={wrapRef} className={styles.wrap} role="img" aria-label={t("literals.Intraday oscilloscope price chart", "Intraday oscilloscope price chart")}>
      <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true">
        {t("literals.Intraday oscilloscope chart", "Intraday oscilloscope chart")}
      </canvas>
    </div>
  );
}
