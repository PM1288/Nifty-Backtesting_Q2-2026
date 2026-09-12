import { finite, type EvidenceRow, type StrikeFlowLeg, type StrikeFlowRow } from "./positioningFlow";

export type LevelRole = "Resistance" | "Support";
export type StructuralLevel = { code: string; value: number };
export type LevelComponent = { value: number | null; weight: number };

export type ProbableLevel = {
  ruleVersion: "CANDIDATE_LEVEL_RESEARCH_V1_L0" | "CANDIDATE_LEVEL_RESEARCH_V1_L1";
  variant: "L0" | "L1";
  role: LevelRole;
  strike: number;
  marketStrength: number;
  components: {
    oi: number | null; addedOi: number | null; volume: number | null;
    persistence: number | null; priceOiState: number | null; confluence: number | null;
  };
  oi: number | null;
  deltaOi: number | null;
  addedOi: number | null;
  removedOi: number | null;
  volume: number | null;
  persistence: number | null;
  velocityPerHour: number | null;
  buildState: string;
  structuralConfluence: string[];
  deltaWeightedOi: number | null;
  deltaWeightState: "AVAILABLE" | "UNAVAILABLE";
  inputCoverage: number;
  warnings: string[];
};

export type ProbableZone = {
  ruleVersion: ProbableLevel["ruleVersion"];
  variant: ProbableLevel["variant"];
  rank: number;
  role: LevelRole;
  zoneLow: number;
  coreStrike: number;
  zoneHigh: number;
  marketStrength: number;
  participantAlignment: string;
  participantAlignmentScore: number | null;
  confidence: "High" | "Medium" | "Low";
  oi: number | null;
  deltaOi: number | null;
  volume: number | null;
  persistence: number | null;
  velocityPerHour: number | null;
  buildState: string;
  structuralConfluence: string[];
  deltaWeightedOi: number | null;
  memberStrikes: number[];
  evidence: ProbableLevel[];
};

export type ZoneOutcome = {
  reached: boolean;
  confirmedBreak: boolean;
  rejected: boolean;
  firstTouchAt: string | null;
  confirmedBreakAt: string | null;
};

export const LEVEL_WEIGHTS = {
  L0: { currentOi: 1 },
  L1: { currentOi: .40, intervalVolume: .30, absoluteOiChange: .30 },
  L2: { state: "NOT_AVAILABLE", reason: "RVOL_PERSISTENCE_AND_PAST_ONLY_PROXIMITY_REQUIRED" },
} as const;

function percentiles(values: Array<number | null>): Array<number | null> {
  const observed = values.filter((value): value is number => value != null && Number.isFinite(value)).sort((a, b) => a - b);
  const allZero = observed.length > 0 && observed.every((value) => value === 0);
  return values.map((value) => {
    if (value == null || !Number.isFinite(value) || !observed.length) return null;
    if (allZero) return 0;
    const below = observed.filter((candidate) => candidate < value).length;
    const equal = observed.filter((candidate) => candidate === value).length;
    return (below + equal / 2) / observed.length;
  });
}

export function weightedAvailableScore(components: Record<string, LevelComponent>): { score: number; coverage: number } {
  const entries = Object.values(components);
  const available = entries.filter((entry) => entry.value != null);
  const availableWeight = available.reduce((sum, entry) => sum + entry.weight, 0);
  const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
  const score = availableWeight <= 0 ? 0 : 100 * available.reduce((sum, entry) => sum + entry.value! * entry.weight, 0) / availableWeight;
  return { score, coverage: totalWeight <= 0 ? 0 : availableWeight / totalWeight };
}

function stateScore(leg: StrikeFlowLeg): number | null {
  if (leg.classification === "Unavailable") return null;
  if (leg.classification === "Short build-up") return 1;
  if (leg.classification === "Unchanged") return .5;
  return 0;
}

function wallState(leg: StrikeFlowLeg): string {
  if (leg.oi === 0 && (leg.baselineOi ?? 0) > 0) return "Removed";
  if (leg.classification === "Short build-up") return "Building";
  if (leg.classification === "Unchanged") return "Holding";
  if (leg.classification === "Long unwinding" || leg.classification === "Short covering") return "Unwinding";
  if (leg.classification === "Long build-up") return "Weakening";
  return "Unavailable";
}

function velocity(leg: StrikeFlowLeg): number | null {
  if (leg.oiChange == null || !leg.observedAt) return null;
  const baselineAt = leg.baselineAt;
  if (!baselineAt) return null;
  const hours = (Date.parse(leg.observedAt) - Date.parse(baselineAt)) / 3_600_000;
  return Number.isFinite(hours) && hours > 0 ? leg.oiChange / hours : null;
}

function sumComplete(values: Array<number | null>): number | null {
  return values.length && values.every((value) => value != null) ? values.reduce<number>((sum, value) => sum + value!, 0) : null;
}

function participantAlignment(participants: readonly EvidenceRow[]) {
  const row = (name: string) => participants.find((candidate) => candidate.client_type === name);
  const sign = (value: unknown) => finite(value) == null || finite(value) === 0 ? 0 : finite(value)! > 0 ? 1 : -1;
  const fii = row("FII"), pro = row("Pro");
  const currentAligned = sign(fii?.options_proxy) !== 0 && sign(fii?.options_proxy) === sign(pro?.options_proxy);
  const deltaAligned = sign(fii?.delta_options_proxy) !== 0 && sign(fii?.delta_options_proxy) === sign(pro?.delta_options_proxy);
  const available = [fii?.options_proxy, pro?.options_proxy, fii?.delta_options_proxy, pro?.delta_options_proxy].every((value) => finite(value) != null);
  if (!available) return { label: "Unavailable", score: null };
  const score = (Number(currentAligned) + Number(deltaAligned)) * 50;
  return { label: score === 100 ? "Aligned" : score === 50 ? "Mixed" : "Divergent", score };
}

export function extractStructuralLevels(views: readonly EvidenceRow[]): StructuralLevel[] {
  const output: StructuralLevel[] = [];
  for (const view of views) {
    const selected = view.selected && typeof view.selected === "object" ? view.selected as EvidenceRow : null;
    const support = view.support && typeof view.support === "object" ? view.support as EvidenceRow : null;
    const resistanceValue = finite(selected?.resistance ?? selected?.price);
    const supportValue = finite(support?.support ?? support?.price);
    if (resistanceValue != null) output.push({ code: String(view.codeResistance ?? "R"), value: resistanceValue });
    if (supportValue != null) output.push({ code: String(view.codeSupport ?? "S"), value: supportValue });
  }
  return output.filter((level, index) => output.findIndex((candidate) => candidate.code === level.code && candidate.value === level.value) === index);
}

export function evaluateZoneOutcome(
  zone: Pick<ProbableZone, "role" | "zoneLow" | "zoneHigh">,
  bars: readonly { at: string; high: number; low: number; close: number }[],
  rejectionDistance: number,
): ZoneOutcome {
  const touches = (bar: (typeof bars)[number]) => bar.high >= zone.zoneLow && bar.low <= zone.zoneHigh;
  const firstTouchIndex = bars.findIndex(touches);
  const breakIndex = bars.findIndex((bar, index) => {
    if (index === 0) return false;
    return zone.role === "Resistance"
      ? bar.close > zone.zoneHigh && bars[index - 1].close > zone.zoneHigh
      : bar.close < zone.zoneLow && bars[index - 1].close < zone.zoneLow;
  });
  const afterTouch = firstTouchIndex < 0 ? [] : bars.slice(firstTouchIndex);
  const rejected = firstTouchIndex >= 0 && breakIndex < 0 && afterTouch.some((bar) => zone.role === "Resistance"
    ? bar.low <= zone.zoneLow - rejectionDistance
    : bar.high >= zone.zoneHigh + rejectionDistance);
  return {
    reached: firstTouchIndex >= 0,
    confirmedBreak: breakIndex >= 0,
    rejected,
    firstTouchAt: firstTouchIndex < 0 ? null : bars[firstTouchIndex].at,
    confirmedBreakAt: breakIndex < 0 ? null : bars[breakIndex].at,
  };
}

export function buildProbableLevels(
  rows: readonly StrikeFlowRow[],
  structuralLevels: readonly StructuralLevel[],
  spot: number | null = null,
): ProbableLevel[] {
  const inferredStep = rows.length > 1 ? Math.min(...rows.slice(1).map((row, index) => row.strike - rows[index].strike).filter((value) => value > 0)) : 50;
  const output: ProbableLevel[] = [];
  for (const [side, role] of [["ce", "Resistance"], ["pe", "Support"]] as const) {
    const legs = rows.map((row) => row[side]);
    const oiRanks = percentiles(legs.map((leg) => leg.oi));
    const adjustmentRanks = percentiles(legs.map((leg) => leg.oiChange == null ? null : Math.abs(leg.oiChange)));
    const volumeRanks = percentiles(legs.map((leg) => leg.intervalVolume));
    rows.forEach((row, index) => {
      const leg = row[side];
      const nearby = structuralLevels.filter((level) => Math.abs(level.value - row.strike) <= inferredStep / 2);
      const round = row.strike % 100 === 0;
      const confluence = nearby.length ? 1 : round ? .5 : 0;
      const l1Available = oiRanks[index] != null && adjustmentRanks[index] != null && volumeRanks[index] != null;
      const marketStrength = l1Available
        ? 100 * (.40 * oiRanks[index]! + .30 * volumeRanks[index]! + .30 * adjustmentRanks[index]!)
        : 100 * (oiRanks[index] ?? 0);
      const variant = l1Available ? "L1" : "L0";
      output.push({
        ruleVersion: `CANDIDATE_LEVEL_RESEARCH_V1_${variant}`, variant,
        role, strike: row.strike, marketStrength,
        components: { oi: oiRanks[index], addedOi: adjustmentRanks[index], volume: volumeRanks[index], persistence: null, priceOiState: stateScore(leg), confluence },
        oi: leg.oi, deltaOi: leg.oiChange,
        addedOi: leg.oiChange == null ? null : Math.max(leg.oiChange, 0),
        removedOi: leg.oiChange == null ? null : Math.max(-leg.oiChange, 0),
        volume: leg.intervalVolume, persistence: null, velocityPerHour: velocity(leg),
        buildState: wallState(leg), structuralConfluence: [...nearby.map((level) => level.code), ...(round ? ["Round number"] : [])],
        deltaWeightedOi: null, deltaWeightState: "UNAVAILABLE", inputCoverage: variant === "L1" ? 1 : oiRanks[index] == null ? 0 : .4,
        warnings: [
          ...(variant === "L0" ? ["L1_UNAVAILABLE_INTERVAL_VOLUME_OR_OI_CHANGE"] : []),
          ...(leg.oiUnit === "UNKNOWN_SOURCE_UNIT" || leg.volumeUnit === "UNKNOWN_SOURCE_UNIT" ? ["SOURCE_UNITS_UNVERIFIED"] : []),
          ...(leg.comparisonWindowState !== "COMMON_SNAPSHOT_BASELINE" ? ["PRICE_OI_WINDOW_NOT_COMPARABLE"] : []),
        ],
      });
    });
  }
  return output.sort((left, right) => right.marketStrength - left.marketStrength || left.strike - right.strike);
}

export function buildProbableZones(
  rows: readonly StrikeFlowRow[], structuralLevels: readonly StructuralLevel[], participants: readonly EvidenceRow[], minimumStrength = 45, spot: number | null = null,
): ProbableZone[] {
  const levels = buildProbableLevels(rows, structuralLevels, spot);
  const boundaries = new Map(rows.map((row, index) => {
    const previousGap = index > 0 ? row.strike - rows[index - 1].strike : rows[1]?.strike - row.strike;
    const nextGap = index < rows.length - 1 ? rows[index + 1].strike - row.strike : row.strike - rows[index - 1]?.strike;
    const left = row.strike - (previousGap > 0 ? previousGap : 50) / 2;
    const right = row.strike + (nextGap > 0 ? nextGap : 50) / 2;
    return [row.strike, { left, right, index }];
  }));
  const alignment = participantAlignment(participants);
  const selected = (["Resistance", "Support"] as const).flatMap((role) => {
    const side = levels.filter((level) => level.role === role && (spot == null || (role === "Resistance" ? level.strike >= spot : level.strike <= spot)));
    const strong = side.filter((level) => level.marketStrength >= minimumStrength);
    return strong.length ? strong : side.slice(0, 2);
  }).sort((left, right) => left.role.localeCompare(right.role) || left.strike - right.strike);
  const groups: ProbableLevel[][] = [];
  for (const level of selected) {
    const prior = groups.at(-1);
    const priorBoundary = prior ? boundaries.get(prior.at(-1)!.strike) : null;
    const currentBoundary = boundaries.get(level.strike);
    if (prior && prior[0].role === level.role && priorBoundary && currentBoundary && currentBoundary.index === priorBoundary.index + 1) prior.push(level);
    else groups.push([level]);
  }
  const zones = groups.map((evidence) => {
    const core = [...evidence].sort((left, right) => right.marketStrength - left.marketStrength)[0];
    const coverage = evidence.reduce((sum, level) => sum + level.inputCoverage, 0) / evidence.length;
    const strength = evidence.reduce((sum, level) => sum + level.marketStrength, 0) / evidence.length;
    const confidence = coverage >= .8 && strength >= 70 ? "High" : coverage >= .6 && strength >= 45 ? "Medium" : "Low";
    return {
      ruleVersion: core.ruleVersion, variant: core.variant, rank: 0, role: core.role,
      zoneLow: core.role === "Resistance" && spot != null
        ? Math.max(boundaries.get(evidence[0].strike)?.left ?? evidence[0].strike, spot)
        : boundaries.get(evidence[0].strike)?.left ?? evidence[0].strike,
      coreStrike: core.strike,
      zoneHigh: core.role === "Support" && spot != null
        ? Math.min(boundaries.get(evidence.at(-1)!.strike)?.right ?? evidence.at(-1)!.strike, spot)
        : boundaries.get(evidence.at(-1)!.strike)?.right ?? evidence.at(-1)!.strike,
      marketStrength: strength, participantAlignment: alignment.label, participantAlignmentScore: alignment.score, confidence,
      oi: sumComplete(evidence.map((level) => level.oi)), deltaOi: sumComplete(evidence.map((level) => level.deltaOi)),
      volume: sumComplete(evidence.map((level) => level.volume)), persistence: null,
      velocityPerHour: sumComplete(evidence.map((level) => level.velocityPerHour)), buildState: core.buildState,
      structuralConfluence: [...new Set(evidence.flatMap((level) => level.structuralConfluence))],
      deltaWeightedOi: null, memberStrikes: evidence.map((level) => level.strike), evidence,
    } satisfies ProbableZone;
  }).sort((left, right) => right.marketStrength - left.marketStrength || left.coreStrike - right.coreStrike);
  return zones.map((zone, index) => ({ ...zone, rank: index + 1 }));
}
