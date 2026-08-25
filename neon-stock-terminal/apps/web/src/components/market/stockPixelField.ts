export type StockPixelTone = "positive" | "negative" | "high" | "medium" | "neutral" | "missing";

export const STOCK_PIXEL_MIN_ALPHA = 0.08;
export const STOCK_PIXEL_MAX_ALPHA = 0.26;

const PIXEL_COLOURS: Record<StockPixelTone, string> = {
  positive: "#159766",
  negative: "#d2485b",
  high: "#7558d5",
  medium: "#c68a0b",
  neutral: "#64748b",
  missing: "#8996a8",
};

export function stockPixelColour(tone: StockPixelTone): string {
  return PIXEL_COLOURS[tone];
}

export function stockPixelCellSize(width: number): number {
  if (!Number.isFinite(width) || width <= 0) return 5;
  return width >= 260 ? 6 : width >= 160 ? 5 : 4;
}
