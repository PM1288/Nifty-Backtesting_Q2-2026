export type EvidenceRow = Record<string, unknown>;

export const positioningMetrics = [
  { key: "options_proxy", label: "Options Proxy", deltaKey: "delta_options_proxy", previousKey: "previous_options_proxy", unit: "contracts" },
  { key: "net_calls", label: "Net Calls", deltaKey: "delta_net_calls", previousKey: "previous_net_calls", unit: "contracts" },
  { key: "net_puts", label: "Net Puts", deltaKey: "delta_net_puts", previousKey: "previous_net_puts", unit: "contracts" },
  { key: "net_futures", label: "Index Futures", deltaKey: "delta_net_futures", previousKey: "previous_net_futures", unit: "contracts" },
] as const;

export type PositioningMetric = (typeof positioningMetrics)[number]["key"];
export type ParticipantState =
  | "Positive & adding"
  | "Positive but reducing"
  | "Negative but improving"
  | "Negative & deepening"
  | "Positive & unchanged"
  | "Negative & unchanged"
  | "Flat & adding"
  | "Flat & reducing"
  | "Flat & unchanged"
  | "Unavailable";

export const finite = (candidate: unknown): number | null => {
  if (typeof candidate === "number") return Number.isFinite(candidate) ? candidate : null;
  if (typeof candidate !== "string" || candidate.trim() === "") return null;
  const parsed = Number(candidate);
  return Number.isFinite(parsed) ? parsed : null;
};

export function participantPositionState(current: unknown, delta: unknown): ParticipantState {
  const position = finite(current);
  const change = finite(delta);
  if (position == null || change == null) return "Unavailable";
  if (position > 0 && change > 0) return "Positive & adding";
  if (position > 0 && change < 0) return "Positive but reducing";
  if (position < 0 && change > 0) return "Negative but improving";
  if (position < 0 && change < 0) return "Negative & deepening";
  if (position > 0) return "Positive & unchanged";
  if (position < 0) return "Negative & unchanged";
  if (change > 0) return "Flat & adding";
  if (change < 0) return "Flat & reducing";
  return "Flat & unchanged";
}

export type BuildUpState =
  | "Long build-up"
  | "Short build-up"
  | "Short covering"
  | "Long unwinding"
  | "Unchanged"
  | "Unavailable";

export function contractBuildUp(priceChange: unknown, oiChange: unknown): BuildUpState {
  const price = finite(priceChange);
  const oi = finite(oiChange);
  if (price == null || oi == null) return "Unavailable";
  if (price > 0 && oi > 0) return "Long build-up";
  if (price < 0 && oi > 0) return "Short build-up";
  if (price > 0 && oi < 0) return "Short covering";
  if (price < 0 && oi < 0) return "Long unwinding";
  return "Unchanged";
}

export type StrikeFlowLeg = {
  contractId: string | null;
  price: number | null;
  baselinePrice: number | null;
  priceChange: number | null;
  priceChangePct: number | null;
  sessionOpenPrice: number | null;
  sessionOpenChange: number | null;
  sessionOpenChangePct: number | null;
  oi: number | null;
  baselineOi: number | null;
  oiChange: number | null;
  oiChangePct: number | null;
  volume: number | null;
  baselineVolume: number | null;
  intervalVolume: number | null;
  netOiToIntervalVolume: number | null;
  netOiToIntervalVolumeState: "AVAILABLE" | "REVIEW_ABOVE_ONE" | "UNAVAILABLE";
  oiShare: number | null;
  deltaOiShare: number | null;
  volumeShare: number | null;
  intervalVolumeShare: number | null;
  classification: BuildUpState;
  comparisonWindowState: string;
  volumeCounterState: string;
  oiUnit: string;
  volumeUnit: string;
  baselineKind: string;
  baselineAt: string | null;
  observedAt: string | null;
};

export type StrikeFlowRow = { strike: number; ce: StrikeFlowLeg; pe: StrikeFlowLeg };

const emptyLeg = (): StrikeFlowLeg => ({
  contractId: null, price: null, baselinePrice: null, priceChange: null,
  priceChangePct: null, sessionOpenPrice: null, sessionOpenChange: null, sessionOpenChangePct: null,
  oi: null, baselineOi: null, oiChange: null,
  oiChangePct: null, volume: null, baselineVolume: null, intervalVolume: null, oiShare: null, deltaOiShare: null,
  volumeShare: null, intervalVolumeShare: null, classification: "Unavailable", baselineKind: "UNAVAILABLE",
  comparisonWindowState: "BASELINE_UNAVAILABLE", volumeCounterState: "BASELINE_UNAVAILABLE",
  netOiToIntervalVolume: null, netOiToIntervalVolumeState: "UNAVAILABLE",
  oiUnit: "UNKNOWN_SOURCE_UNIT", volumeUnit: "UNKNOWN_SOURCE_UNIT",
  baselineAt: null, observedAt: null,
});

function rawOiChange(row: EvidenceRow): number | null {
  const layers = row.oi_layers && typeof row.oi_layers === "object"
    ? row.oi_layers as EvidenceRow
    : null;
  if (layers?.state === "COMPARABLE") return finite(layers.change);
  return null;
}

function legFrom(row: EvidenceRow | undefined): StrikeFlowLeg {
  if (!row) return emptyLeg();
  const price = finite(row.last_price);
  const baselinePrice = finite(row.baseline_last_price);
  const priceChange = price == null || baselinePrice == null ? null : price - baselinePrice;
  const sessionOpenPrice = finite(row.day_open);
  const sessionOpenChange = price == null || sessionOpenPrice == null ? null : price - sessionOpenPrice;
  const oi = finite(row.open_interest);
  const baselineOi = finite(row.baseline_open_interest);
  const oiChange = rawOiChange(row);
  const intervalVolume = finite(row.interval_volume);
  const netOiToIntervalVolume = oiChange == null || intervalVolume == null || intervalVolume <= 0 ? null : Math.abs(oiChange) / intervalVolume;
  return {
    contractId: row.instrument_identifier == null ? null : String(row.instrument_identifier),
    price, baselinePrice, priceChange,
    priceChangePct: priceChange == null || baselinePrice == null || baselinePrice === 0 ? null : 100 * priceChange / baselinePrice,
    sessionOpenPrice, sessionOpenChange,
    sessionOpenChangePct: sessionOpenChange == null || sessionOpenPrice == null || sessionOpenPrice === 0 ? null : 100 * sessionOpenChange / sessionOpenPrice,
    oi, baselineOi, oiChange,
    oiChangePct: oiChange == null || baselineOi == null || baselineOi === 0 ? null : 100 * oiChange / baselineOi,
    volume: finite(row.total_traded_volume), baselineVolume: finite(row.baseline_total_traded_volume), intervalVolume,
    netOiToIntervalVolume,
    netOiToIntervalVolumeState: netOiToIntervalVolume == null ? "UNAVAILABLE" : netOiToIntervalVolume > 1 ? "REVIEW_ABOVE_ONE" : "AVAILABLE",
    oiShare: null, deltaOiShare: null, volumeShare: null, intervalVolumeShare: null,
    classification: contractBuildUp(priceChange, oiChange),
    comparisonWindowState: String(row.comparison_window_state ?? "BASELINE_UNAVAILABLE"),
    volumeCounterState: String(row.volume_counter_state ?? "BASELINE_UNAVAILABLE"),
    oiUnit: String(row.oi_unit ?? "UNKNOWN_SOURCE_UNIT"), volumeUnit: String(row.volume_unit ?? "UNKNOWN_SOURCE_UNIT"),
    baselineKind: String(row.baseline_kind ?? "BASELINE_UNAVAILABLE"),
    baselineAt: row.baseline_collected_at == null ? null : String(row.baseline_collected_at),
    observedAt: row.exchange_feed_at == null && row.collected_at == null ? null : String(row.exchange_feed_at ?? row.collected_at),
  };
}

export function buildStrikeFlowRows(legs: readonly EvidenceRow[]): StrikeFlowRow[] {
  const strikes = [...new Set(legs.map((row) => finite(row.strike)).filter((strike): strike is number => strike != null))]
    .sort((left, right) => left - right);
  const rows = strikes.map((strike) => ({
    strike,
    ce: legFrom(legs.find((row) => finite(row.strike) === strike && row.option_type === "CE")),
    pe: legFrom(legs.find((row) => finite(row.strike) === strike && row.option_type === "PE")),
  }));
  for (const side of ["ce", "pe"] as const) {
    const oiTotal = rows.reduce((sum, row) => sum + (row[side].oi ?? 0), 0);
    const deltaTotal = rows.reduce((sum, row) => sum + Math.abs(row[side].oiChange ?? 0), 0);
    const volumeTotal = rows.reduce((sum, row) => sum + (row[side].volume ?? 0), 0);
    const intervalVolumeTotal = rows.reduce((sum, row) => sum + (row[side].intervalVolume ?? 0), 0);
    for (const row of rows) {
      const leg = row[side];
      leg.oiShare = leg.oi == null || oiTotal <= 0 ? null : leg.oi / oiTotal;
      leg.deltaOiShare = leg.oiChange == null || deltaTotal <= 0 ? null : Math.abs(leg.oiChange) / deltaTotal;
      leg.volumeShare = leg.volume == null || volumeTotal <= 0 ? null : leg.volume / volumeTotal;
      leg.intervalVolumeShare = leg.intervalVolume == null || intervalVolumeTotal <= 0 ? null : leg.intervalVolume / intervalVolumeTotal;
    }
  }
  return rows;
}

const completeSum = (values: Array<number | null>) => values.length > 0 && values.every((value) => value != null)
  ? values.reduce<number>((sum, value) => sum + value!, 0)
  : null;

export function summarizeStrikeFlow(rows: readonly StrikeFlowRow[]) {
  const side = (key: "ce" | "pe") => {
    const legs = rows.map((row) => row[key]);
    const oi = completeSum(legs.map((leg) => leg.oi));
    const deltaOi = completeSum(legs.map((leg) => leg.oiChange));
    const volume = completeSum(legs.map((leg) => leg.volume));
    return {
      oi, deltaOi, volume,
      oiCoverage: legs.filter((leg) => leg.oi != null).length,
      deltaCoverage: legs.filter((leg) => leg.oiChange != null).length,
      volumeCoverage: legs.filter((leg) => leg.volume != null).length,
      total: legs.length,
    };
  };
  const ce = side("ce");
  const pe = side("pe");
  return {
    ce, pe,
    oiPcr: ce.oi == null || pe.oi == null || ce.oi <= 0 ? null : pe.oi / ce.oi,
    volumePcr: ce.volume == null || pe.volume == null || ce.volume <= 0 ? null : pe.volume / ce.volume,
    marketState: ce.deltaOi == null || pe.deltaOi == null
      ? "Change baseline unavailable"
      : ce.deltaOi > 0 && pe.deltaOi > 0
        ? "Both sides adding"
        : ce.deltaOi < 0 && pe.deltaOi < 0
          ? "Both sides unwinding"
          : "Mixed OI flow",
  };
}

export function fiiProAlignment(participants: readonly EvidenceRow[], metric: PositioningMetric) {
  const definition = positioningMetrics.find((candidate) => candidate.key === metric)!;
  const row = (name: string) => participants.find((candidate) => candidate.client_type === name);
  const fii = row("FII"), pro = row("Pro"), client = row("Client");
  const sign = (value: number | null) => value == null || value === 0 ? 0 : value > 0 ? 1 : -1;
  const currentSigns = [finite(fii?.[definition.key]), finite(pro?.[definition.key])].map(sign);
  const deltaSigns = [finite(fii?.[definition.deltaKey]), finite(pro?.[definition.deltaKey])].map(sign);
  const label = (values: number[], positive: string, negative: string) => values.includes(0)
    ? "MIXED / UNAVAILABLE"
    : values[0] !== values[1]
      ? "DIVERGENT"
      : values[0] > 0 ? positive : negative;
  const participantDirection = label(currentSigns, "ALIGNED POSITIVE", "ALIGNED NEGATIVE");
  const changeDirection = label(deltaSigns, "ALIGNED ADDING", "ALIGNED REDUCING");
  const clientSign = sign(finite(client?.[definition.key]));
  const fiiProSign = currentSigns[0] === currentSigns[1] ? currentSigns[0] : 0;
  return {
    currentDirection: participantDirection,
    changeDirection,
    clientRelation: !clientSign || !fiiProSign ? "MIXED" : clientSign === fiiProSign ? "ALIGNED" : "CLIENT OPPOSITE",
  };
}

export function correlation(left: Array<number | null>, right: Array<number | null>) {
  const pairs = left.map((value, index) => [value, right[index]] as const)
    .filter((pair): pair is readonly [number, number] => pair[0] != null && pair[1] != null);
  if (pairs.length < 3) return { value: null, samples: pairs.length };
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const xs = pairs.map(([x]) => x), ys = pairs.map(([, y]) => y);
  const xMean = mean(xs), yMean = mean(ys);
  const numerator = pairs.reduce((sum, [x, y]) => sum + (x - xMean) * (y - yMean), 0);
  const denominator = Math.sqrt(
    pairs.reduce((sum, [x]) => sum + (x - xMean) ** 2, 0)
    * pairs.reduce((sum, [, y]) => sum + (y - yMean) ** 2, 0),
  );
  return { value: denominator === 0 ? null : numerator / denominator, samples: pairs.length };
}

export function buildParticipantForwardEvaluation(
  history: readonly EvidenceRow[], candles: readonly EvidenceRow[], metric: PositioningMetric,
) {
  const definition = positioningMetrics.find((candidate) => candidate.key === metric)!;
  const dates = [...new Set(history.map((row) => String(row.trade_date ?? "").slice(0, 10)).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)))].sort();
  const daily = candles.map((row) => ({ date: String(row.date ?? "").slice(0, 10), open: finite(row.open), high: finite(row.high), low: finite(row.low), close: finite(row.close) }))
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date)).sort((left, right) => left.date.localeCompare(right.date));
  return ["FII", "Pro", "Client", "DII"].map((participant) => {
    const current: Array<number | null> = [], delta: Array<number | null> = [], y: Array<number | null> = [];
    for (const date of dates) {
      const source = history.find((row) => String(row.trade_date ?? "").slice(0, 10) === date && row.client_type === participant);
      const next = daily.find((row) => row.date > date);
      current.push(finite(source?.[metric]));
      delta.push(finite(source?.[definition.deltaKey]));
      y.push(next?.open == null || next?.close == null || next.open === 0 ? null : 100 * (next.close / next.open - 1));
    }
    return { participant, currentOpenCloseCorrelation: correlation(current, y), deltaOpenCloseCorrelation: correlation(delta, y) };
  });
}
