import { clamp } from "./math";

export type Hsl = { h: number; s: number; l: number };

export function hslToCss(hsl: Hsl, a = 1) {
  const { h, s, l } = hsl;
  return `hsla(${h.toFixed(1)} ${s.toFixed(1)}% ${l.toFixed(1)}% / ${a})`;
}

/**
 * Leaf color scale:
 * - negative: reds
 * - neutral (-0.2..+0.2): warm yellow
 * - positive: greens
 */
export function leafHslFromChange(changePct: number): Hsl {
  const neutralBand = 0.2;
  const mag = Math.min(1, Math.abs(changePct) / 3.0); // saturates around 3%
  if (Math.abs(changePct) <= neutralBand) {
    // yellow-ish
    return { h: 48, s: 75, l: 56 };
  }
  if (changePct < 0) {
    // deep red -> softer red
    const h = 7 + (1 - mag) * 6;
    const s = 78;
    const l = 52 - mag * 10;
    return { h, s, l };
  }
  // green
  const h = 135 - mag * 10;
  const s = 70;
  const l = 52 - mag * 6;
  return { h, s, l };
}

export function branchInnerHslFromSector(avgChangePct: number): Hsl {
  const base = leafHslFromChange(avgChangePct);
  // desaturate + darken for "inner sap"
  return { h: base.h, s: clamp(base.s * 0.65, 20, 70), l: clamp(base.l * 0.85, 20, 55) };
}

/** RSI 30..70 -> red..yellow..green */
export function hslFromRsi(rsi: number): Hsl {
  const t = clamp((rsi - 30) / 40, 0, 1);
  // 0 => red (8), 0.5 => yellow (48), 1 => green (132)
  const h = t < 0.5 ? 8 + (48 - 8) * (t / 0.5) : 48 + (132 - 48) * ((t - 0.5) / 0.5);
  return { h, s: 80, l: 55 };
}

/** Sun color from NIFTY change */
export function hslFromIndexChange(changePct: number): Hsl {
  const mag = Math.min(1, Math.abs(changePct) / 2.5);
  if (Math.abs(changePct) <= 0.05) return { h: 50, s: 85, l: 60 };
  if (changePct < 0) return { h: 6, s: 88, l: 58 - mag * 8 };
  return { h: 132, s: 78, l: 56 - mag * 6 };
}
