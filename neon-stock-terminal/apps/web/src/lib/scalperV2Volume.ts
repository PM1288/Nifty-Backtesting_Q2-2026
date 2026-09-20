export type ScalperV2VolumeObservation = {
  time: number;
  value: number | null;
};

export type ScalperV2VolumeEmaPoint = {
  time: number;
  value: number;
};

/**
 * The shorter intraday views retain a slower volume baseline while the wider
 * 15m/1h views use five completed buckets, as requested for the workstation.
 */
export function scalperV2VolumeEmaPeriod(interval: number): 5 | 20 {
  return interval === 1 || interval === 5 ? 20 : 5;
}

/**
 * Standard EMA seeded by the first complete simple average. Missing volume
 * breaks the run, so the chart never joins two separate evidence windows.
 */
export function scalperV2VolumeEma(
  observations: ScalperV2VolumeObservation[],
  period: number,
): ScalperV2VolumeEmaPoint[] {
  if (!Number.isInteger(period) || period <= 0) return [];
  const alpha = 2 / (period + 1);
  const output: ScalperV2VolumeEmaPoint[] = [];
  let seed: ScalperV2VolumeObservation[] = [];
  let previous: number | null = null;

  for (const observation of observations) {
    if (observation.value == null || !Number.isFinite(observation.value) || observation.value < 0) {
      seed = [];
      previous = null;
      continue;
    }
    if (previous == null) {
      seed.push(observation);
      if (seed.length < period) continue;
      const value = seed.reduce((sum, row) => sum + row.value!, 0) / period;
      previous = value;
      output.push({ time: observation.time, value });
      continue;
    }
    const value: number = observation.value * alpha + previous * (1 - alpha);
    previous = value;
    output.push({ time: observation.time, value });
  }
  return output;
}
