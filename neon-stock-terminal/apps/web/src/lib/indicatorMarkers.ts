const DARK_RED = "#3A000C";
const RED = "#FF0033";
const WHITE = "#FFFFFF";
const GREEN = "#00FF66";
const DARK_GREEN = "#003B18";

type ColorStop = {
  at: number;
  color: string;
};

const RSI_STOPS: ColorStop[] = [
  { at: 10, color: DARK_RED },
  { at: 30, color: RED },
  { at: 50, color: WHITE },
  { at: 70, color: GREEN },
  { at: 90, color: DARK_GREEN }
];

const WILLR_STOPS: ColorStop[] = [
  { at: -100, color: DARK_RED },
  { at: -70, color: RED },
  { at: -50, color: WHITE },
  { at: -20, color: GREEN },
  { at: 0, color: DARK_GREEN }
];

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function hexToRgb(hex: string): [number, number, number] {
  const parsed = hex.replace("#", "");
  const r = Number.parseInt(parsed.slice(0, 2), 16);
  const g = Number.parseInt(parsed.slice(2, 4), 16);
  const b = Number.parseInt(parsed.slice(4, 6), 16);
  return [r, g, b];
}

function toHex(value: number): string {
  const bounded = clamp(Math.round(value), 0, 255);
  return bounded.toString(16).padStart(2, "0").toUpperCase();
}

function lerpColor(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const blend = clamp(t, 0, 1);
  const r = ar + (br - ar) * blend;
  const g = ag + (bg - ag) * blend;
  const bl = ab + (bb - ab) * blend;
  return `#${toHex(r)}${toHex(g)}${toHex(bl)}`;
}

function interpolateStops(value: number, stops: readonly ColorStop[]): string {
  if (value <= stops[0]!.at) return stops[0]!.color;
  if (value >= stops[stops.length - 1]!.at) return stops[stops.length - 1]!.color;

  for (let index = 0; index < stops.length - 1; index += 1) {
    const left = stops[index]!;
    const right = stops[index + 1]!;
    if (value >= left.at && value <= right.at) {
      const norm = (value - left.at) / (right.at - left.at);
      return lerpColor(left.color, right.color, norm);
    }
  }
  return stops[stops.length - 1]!.color;
}

export function normalizeRsi(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const clamped = clamp(value, 10, 90);
  return (clamped - 10) / 80;
}

export function normalizeWillr(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const clamped = clamp(value, -100, 0);
  return (clamped + 100) / 100;
}

export function rsiColor(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "rgba(255,255,255,0.55)";
  return interpolateStops(clamp(value, 10, 90), RSI_STOPS);
}

export function willrColor(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "rgba(255,255,255,0.55)";
  return interpolateStops(clamp(value, -100, 0), WILLR_STOPS);
}
