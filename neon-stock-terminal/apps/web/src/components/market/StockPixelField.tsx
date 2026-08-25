import { useEffect, useRef } from "react";
import { STOCK_PIXEL_MAX_ALPHA, STOCK_PIXEL_MIN_ALPHA, stockPixelCellSize, stockPixelColour, type StockPixelTone } from "./stockPixelField";
import styles from "./StockPixelField.module.css";

function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function noise(seed: number, x: number, y: number): number {
  let value = seed ^ Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function motionBlocked(media: MediaQueryList, canvas: HTMLCanvasElement): boolean {
  return media.matches || document.hidden || Boolean(canvas.closest('[data-calm="true"]'));
}

export function StockPixelField({ symbol, tone }: { symbol: string; tone: StockPixelTone }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;

    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const seed = hash(symbol);
    let width = 0;
    let height = 0;
    let intensity = 0;
    let targetIntensity = 0;
    let frameId = 0;

    const resize = () => {
      const rect = host.getBoundingClientRect();
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const paint = () => {
      frameId = 0;
      if (motionBlocked(reducedMotion, canvas)) {
        intensity = 0;
        targetIntensity = 0;
        canvas.style.opacity = "0";
        context.clearRect(0, 0, width, height);
        return;
      }

      intensity += (targetIntensity - intensity) * (targetIntensity > intensity ? 0.2 : 0.24);
      if (Math.abs(targetIntensity - intensity) < 0.012) intensity = targetIntensity;
      context.clearRect(0, 0, width, height);
      const cell = stockPixelCellSize(width);
      const columns = Math.ceil(width / cell);
      const rows = Math.ceil(height / cell);
      context.fillStyle = stockPixelColour(tone);

      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const threshold = noise(seed, column, row) * 0.78;
          const reveal = Math.max(0, Math.min(1, (intensity - threshold) / 0.22));
          if (reveal <= 0) continue;
          // Keep the data text dominant while retaining a clearly visible
          // Pixel Card field beneath it.
          const variation = STOCK_PIXEL_MIN_ALPHA + noise(seed ^ 0x9e3779b9, column, row) * (STOCK_PIXEL_MAX_ALPHA - STOCK_PIXEL_MIN_ALPHA);
          context.globalAlpha = reveal * variation;
          const inset = noise(seed ^ 0x85ebca6b, column, row) > 0.72 ? 1 : 0;
          context.fillRect(column * cell + inset, row * cell + inset, Math.max(2, cell - 1 - inset), Math.max(2, cell - 1 - inset));
        }
      }
      context.globalAlpha = 1;
      canvas.style.opacity = intensity <= 0 ? "0" : "1";
      if (intensity !== targetIntensity) frameId = window.requestAnimationFrame(paint);
    };

    const requestPaint = () => {
      if (!frameId) frameId = window.requestAnimationFrame(paint);
    };
    const reveal = () => {
      if (motionBlocked(reducedMotion, canvas)) return;
      targetIntensity = 1;
      requestPaint();
    };
    const conceal = () => {
      targetIntensity = 0;
      requestPaint();
    };
    const onVisibility = () => document.hidden ? conceal() : undefined;
    const observer = new ResizeObserver(() => {
      resize();
      if (intensity > 0) requestPaint();
    });

    resize();
    observer.observe(host);
    host.addEventListener("pointerenter", reveal);
    host.addEventListener("pointerleave", conceal);
    host.addEventListener("focus", reveal);
    host.addEventListener("blur", conceal);
    document.addEventListener("visibilitychange", onVisibility);
    reducedMotion.addEventListener("change", conceal);
    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      observer.disconnect();
      host.removeEventListener("pointerenter", reveal);
      host.removeEventListener("pointerleave", conceal);
      host.removeEventListener("focus", reveal);
      host.removeEventListener("blur", conceal);
      document.removeEventListener("visibilitychange", onVisibility);
      reducedMotion.removeEventListener("change", conceal);
    };
  }, [symbol, tone]);

  return <canvas ref={canvasRef} className={styles.field} data-stock-pixel-field="true" data-pixel-tone={tone} data-pixel-max-alpha={STOCK_PIXEL_MAX_ALPHA.toFixed(2)} aria-hidden="true" />;
}
