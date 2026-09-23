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
 * Progressive EMA warm-up. Before `period` observations exist the line uses
 * the mean of every valid observation seen in the current run, so it is visible
 * from the first candle. At `period` it becomes the normal SMA seed and then
 * continues as the standard EMA. Missing volume breaks the run, so the chart
 * never joins two separate evidence windows.
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
    if (seed.length < period) {
      seed.push(observation);
      const value = seed.reduce((sum, row) => sum + row.value!, 0) / period;
      const progressiveValue = seed.reduce((sum, row) => sum + row.value!, 0) / seed.length;
      previous = seed.length === period ? value : null;
      output.push({ time: observation.time, value: seed.length === period ? value : progressiveValue });
      continue;
    }
    if (previous == null) {
      // Defensive fallback: a valid full seed always sets `previous` above.
      previous = observation.value;
      output.push({ time: observation.time, value: observation.value });
      continue;
    }
    const value: number = observation.value * alpha + previous * (1 - alpha);
    previous = value;
    output.push({ time: observation.time, value });
  }
  return output;
}
