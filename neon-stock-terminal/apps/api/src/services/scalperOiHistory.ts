export type RawOptionOiObservation = {
  capturedAtMs: number;
  token: string;
  strike: number;
  side: "CE" | "PE";
  oiUnderlyingUnits: number | null;
  lotSize: number | null;
};

export type OptionOiBaseline = {
  token: string;
  oiUnderlyingUnits: number | null;
  lotSize: number | null;
};

export type SpotObservation = { capturedAtMs: number; value: number };

export type DerivedOiHistoryPoint = {
  capturedAt: string;
  strikeCount: number;
  ceContractCount: number;
  ceObservedCount: number;
  ceOi: number | null;
  peContractCount: number;
  peObservedCount: number;
  peOi: number | null;
  ceChangeObservedCount: number;
  ceChangeOi: number | null;
  peChangeObservedCount: number;
  peChangeOi: number | null;
  cohort: Array<{ token: string; strike: number; side: "CE" | "PE" }>;
  quality: {
    spot: number;
    currentObservationCount: number;
    baselineObservationCount: number;
  };
};

function contracts(value: number | null, lotSize: number | null) {
  if (value == null || lotSize == null || !Number.isFinite(value) || !Number.isFinite(lotSize) || lotSize <= 0) return null;
  const converted = value / lotSize;
  return Number.isInteger(converted) ? converted : null;
}

export function deriveScalperOiHistory(input: {
  observations: RawOptionOiObservation[];
  baselines: OptionOiBaseline[];
  spots: SpotObservation[];
  bucketEndsMs: number[];
  strikesAround: number;
}) {
  const observations = [...input.observations].sort((a, b) => a.capturedAtMs - b.capturedAtMs);
  const spots = [...input.spots].sort((a, b) => a.capturedAtMs - b.capturedAtMs);
  const baselineByToken = new Map(input.baselines.map((row) => [row.token, contracts(row.oiUnderlyingUnits, row.lotSize)]));
  const latestByToken = new Map<string, RawOptionOiObservation>();
  const latestSpot = { value: null as number | null };
  let observationIndex = 0;
  let spotIndex = 0;
  const points: DerivedOiHistoryPoint[] = [];

  for (const bucketEndMs of [...input.bucketEndsMs].sort((a, b) => a - b)) {
    while (observationIndex < observations.length && observations[observationIndex].capturedAtMs <= bucketEndMs) {
      const row = observations[observationIndex++];
      latestByToken.set(row.token, row);
    }
    while (spotIndex < spots.length && spots[spotIndex].capturedAtMs <= bucketEndMs) {
      latestSpot.value = spots[spotIndex++].value;
    }
    if (latestSpot.value == null) continue;

    const strikeSides = new Map<number, Map<"CE" | "PE", RawOptionOiObservation>>();
    for (const row of latestByToken.values()) {
      const sides = strikeSides.get(row.strike) ?? new Map<"CE" | "PE", RawOptionOiObservation>();
      sides.set(row.side, row);
      strikeSides.set(row.strike, sides);
    }
    const strikes = [...strikeSides.entries()]
      .filter(([, sides]) => sides.has("CE") && sides.has("PE"))
      .sort((left, right) => Math.abs(left[0] - latestSpot.value!) - Math.abs(right[0] - latestSpot.value!) || left[0] - right[0])
      .slice(0, input.strikesAround * 2 + 1)
      .sort((left, right) => left[0] - right[0]);
    if (strikes.length === 0) continue;

    const cohort = strikes.flatMap(([strike, sides]) => (["CE", "PE"] as const).map((side) => {
      const row = sides.get(side)!;
      return { token: row.token, strike, side };
    }));
    const sideResult = (side: "CE" | "PE") => {
      const selected = cohort.filter((row) => row.side === side);
      const currentValues = selected.map((row) => contracts(latestByToken.get(row.token)?.oiUnderlyingUnits ?? null, latestByToken.get(row.token)?.lotSize ?? null));
      const changeValues = selected.map((row, index) => {
        const baseline = baselineByToken.get(row.token) ?? null;
        const current = currentValues[index];
        return baseline == null || current == null ? null : current - baseline;
      });
      return {
        contractCount: selected.length,
        observedCount: currentValues.filter((value) => value != null).length,
        oi: currentValues.every((value) => value != null) ? currentValues.reduce<number>((sum, value) => sum + value!, 0) : null,
        changeObservedCount: changeValues.filter((value) => value != null).length,
        changeOi: changeValues.every((value) => value != null) ? changeValues.reduce<number>((sum, value) => sum + value!, 0) : null,
      };
    };
    const ce = sideResult("CE");
    const pe = sideResult("PE");
    points.push({
      capturedAt: new Date(bucketEndMs).toISOString(),
      strikeCount: strikes.length,
      ceContractCount: ce.contractCount,
      ceObservedCount: ce.observedCount,
      ceOi: ce.oi,
      peContractCount: pe.contractCount,
      peObservedCount: pe.observedCount,
      peOi: pe.oi,
      ceChangeObservedCount: ce.changeObservedCount,
      ceChangeOi: ce.changeOi,
      peChangeObservedCount: pe.changeObservedCount,
      peChangeOi: pe.changeOi,
      cohort,
      quality: {
        spot: latestSpot.value,
        currentObservationCount: ce.observedCount + pe.observedCount,
        baselineObservationCount: ce.changeObservedCount + pe.changeObservedCount,
      },
    });
  }
  return points;
}
