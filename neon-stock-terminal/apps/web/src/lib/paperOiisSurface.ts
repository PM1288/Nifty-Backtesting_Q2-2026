export type OiisSurfaceLens =
  | "INTRADAY_MAX_PROFIT"
  | "SWING_5D_MAX_PROFIT"
  | "SWING_5D_MAX_DRAWDOWN"
  | "HORIZON_30D_MAX_PROFIT"
  | "HORIZON_30D_MAX_DRAWDOWN";

export type OiisAxisPreset =
  | "O_X"
  | "RSI_ATR"
  | "RSI_WILLIAMS"
  | "ATR_VOLUME"
  | "O_RSI";

export interface OiisAxisDefinition {
  id: OiisAxisPreset;
  label: string;
  detail: string;
  xField: string;
  yField: string;
  xLabel: string;
  yLabel: string;
  xShort: string;
  yShort: string;
  xBounds?: readonly [number, number];
  yBounds?: readonly [number, number];
}

export const oiisAxisDefinitions: OiisAxisDefinition[] = [
  { id: "O_X", label: "Opportunity × execution", detail: "OFactor vs XFactor", xField: "evidence_ofactor", yField: "evidence_xfactor", xLabel: "OFactor · opportunity quality", yLabel: "XFactor · execution quality", xShort: "O", yShort: "X", xBounds: [0, 100], yBounds: [0, 100] },
  { id: "RSI_ATR", label: "RSI × ATR", detail: "Entry-day momentum vs range", xField: "evidence_rsi14", yField: "evidence_atr14", xLabel: "Entry-time RSI14", yLabel: "Entry-time ATR14", xShort: "RSI", yShort: "ATR", xBounds: [0, 100] },
  { id: "RSI_WILLIAMS", label: "RSI × Williams", detail: "Momentum agreement", xField: "evidence_rsi14", yField: "evidence_willr14", xLabel: "Entry-time RSI14", yLabel: "Entry-time Williams %R", xShort: "RSI", yShort: "W%R", xBounds: [0, 100], yBounds: [-100, 0] },
  { id: "ATR_VOLUME", label: "ATR × relative volume", detail: "Range vs participation", xField: "evidence_atr14", yField: "evidence_volume_ratio", xLabel: "Entry-time ATR14", yLabel: "Volume ÷ SMA20", xShort: "ATR", yShort: "RVOL" },
  { id: "O_RSI", label: "Opportunity × RSI", detail: "OIIS opportunity vs momentum", xField: "evidence_ofactor", yField: "evidence_rsi14", xLabel: "OFactor · opportunity quality", yLabel: "Entry-time RSI14", xShort: "O", yShort: "RSI", xBounds: [0, 100], yBounds: [0, 100] },
];

export type PaperOiisTrade = Record<string, unknown>;

export interface OiisSurfacePoint {
  trade: PaperOiisTrade;
  o: number;
  x: number;
  value: number;
}

export interface OiisSurfaceDomain {
  oMin: number;
  oMax: number;
  xMin: number;
  xMax: number;
}

export interface OiisSurfaceCell {
  column: number;
  row: number;
  o: number;
  x: number;
  value: number | null;
}

const finite = (value: unknown) => {
  if (value == null || (typeof value === "string" && value.trim() === "")) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export function oiisSurfaceMetric(trade: PaperOiisTrade, lens: OiisSurfaceLens) {
  if (lens === "INTRADAY_MAX_PROFIT") {
    const original = finite(trade.intraday_max_profit);
    const openedQuantity = finite(trade.opened_quantity);
    const fixedQuantity = finite(trade.fixed_investment_quantity);
    return original != null && openedQuantity != null && openedQuantity > 0 && fixedQuantity != null
      ? original / openedQuantity * fixedQuantity
      : null;
  }
  const field = lens === "SWING_5D_MAX_PROFIT"
    ? "fixed_investment_mfe_5d_pnl"
    : lens === "SWING_5D_MAX_DRAWDOWN"
      ? "fixed_investment_mae_5d_pnl"
      : lens === "HORIZON_30D_MAX_PROFIT"
        ? "fixed_investment_mfe_30d_pnl"
        : "fixed_investment_mae_30d_pnl";
  return finite(trade[field]);
}

export function oiisSurfacePoints(
  trades: PaperOiisTrade[],
  lens: OiisSurfaceLens,
  axisPreset: OiisAxisPreset = "O_X",
) {
  const axes = oiisAxisDefinitions.find((definition) => definition.id === axisPreset) ?? oiisAxisDefinitions[0];
  return trades.flatMap((trade) => {
    const o = finite(trade[axes.xField]);
    const x = finite(trade[axes.yField]);
    const value = oiisSurfaceMetric(trade, lens);
    return o == null || x == null || value == null ? [] : [{ trade, o, x, value }];
  });
}

function boundedDomain(values: number[], bounds?: readonly [number, number]) {
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const centre = (minimum + maximum) / 2;
  const magnitude = Math.max(Math.abs(minimum), Math.abs(maximum), 1);
  const minimumSpread = Math.max(magnitude * .12, 1);
  const spread = Math.max(minimumSpread, maximum - minimum + Math.max((maximum - minimum) * .12, minimumSpread * .35));
  const rawStep = spread / 6;
  const power = Math.pow(10, Math.floor(Math.log10(Math.max(rawStep, .0001))));
  const normalised = rawStep / power;
  const step = (normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10) * power;
  let low = Math.floor((centre - spread / 2) / step) * step;
  let high = Math.ceil((centre + spread / 2) / step) * step;
  if (bounds) {
    low = Math.max(bounds[0], low);
    high = Math.min(bounds[1], high);
  }
  if (high <= low) high = low + step;
  return [low, high] as const;
}

export function oiisSurfaceDomain(
  points: OiisSurfacePoint[],
  axisPreset: OiisAxisPreset = "O_X",
): OiisSurfaceDomain | null {
  if (!points.length) return null;
  const axes = oiisAxisDefinitions.find((definition) => definition.id === axisPreset) ?? oiisAxisDefinitions[0];
  const [oMin, oMax] = boundedDomain(points.map((point) => point.o), axes.xBounds);
  const [xMin, xMax] = boundedDomain(points.map((point) => point.x), axes.yBounds);
  return { oMin, oMax, xMin, xMax };
}

export function interpolateOiisSurface(
  points: OiisSurfacePoint[],
  domain: OiisSurfaceDomain,
  o: number,
  x: number,
) {
  if (!points.length) return null;
  const oSpan = Math.max(1, domain.oMax - domain.oMin);
  const xSpan = Math.max(1, domain.xMax - domain.xMin);
  let weighted = 0;
  let weightTotal = 0;
  let nearest = Number.POSITIVE_INFINITY;
  for (const point of points) {
    const distance = Math.hypot((point.o - o) / oSpan, (point.x - x) / xSpan);
    if (distance < 0.000001) return point.value;
    nearest = Math.min(nearest, distance);
    const weight = 1 / Math.pow(distance, 2.35);
    weighted += point.value * weight;
    weightTotal += weight;
  }
  // Avoid colouring distant, unsupported corners as if they were observed facts.
  return nearest > 0.42 || weightTotal === 0 ? null : weighted / weightTotal;
}

export function buildOiisSurfaceGrid(
  points: OiisSurfacePoint[],
  domain: OiisSurfaceDomain,
  columns = 34,
  rows = 24,
) {
  const cells: OiisSurfaceCell[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const o = domain.oMin + (column + 0.5) / columns * (domain.oMax - domain.oMin);
      const x = domain.xMax - (row + 0.5) / rows * (domain.xMax - domain.xMin);
      cells.push({ column, row, o, x, value: interpolateOiisSurface(points, domain, o, x) });
    }
  }
  return cells;
}

function mix(left: [number, number, number], right: [number, number, number], ratio: number) {
  const channel = (index: number) => Math.round(left[index] + (right[index] - left[index]) * ratio);
  return `rgb(${channel(0)} ${channel(1)} ${channel(2)})`;
}

export function oiisSurfaceColor(value: number | null) {
  if (value == null) return "#e7edf4";
  const capped = Math.max(-2_000, Math.min(2_000, value));
  const red: [number, number, number] = [255, 22, 79];
  const yellow: [number, number, number] = [244, 255, 48];
  const green: [number, number, number] = [0, 122, 69];
  if (capped <= -100) return mix(red, yellow, (capped + 2_000) / 1_900);
  if (capped <= 100) return mix([236, 245, 34], yellow, (capped + 100) / 200);
  return mix(yellow, green, (capped - 100) / 1_900);
}
