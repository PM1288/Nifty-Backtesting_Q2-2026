export type TimedSeriesRow = { time: unknown };
export type SeriesUpdatePlan<T> = { kind: "none" } | { kind: "replace"; rows: T[] } | { kind: "update"; rows: T[] };

const equal = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

/**
 * Uses incremental series.update for a revised last observation and append-only data.
 * Prepend, truncation, correction of older history, or a different time grid requires setData.
 */
export function scalperV2SeriesUpdatePlan<T extends TimedSeriesRow>(previous: readonly T[], next: readonly T[]): SeriesUpdatePlan<T> {
  if (equal(previous, next)) return { kind: "none" };
  if (previous.length === 0 || next.length < previous.length) return { kind: "replace", rows: [...next] };
  const stableEnd = Math.max(0, previous.length - 1);
  for (let index = 0; index < stableEnd; index += 1) {
    if (!equal(previous[index], next[index])) return { kind: "replace", rows: [...next] };
  }
  if (previous.length > 0 && (next[stableEnd] == null || previous[stableEnd].time !== next[stableEnd].time)) return { kind: "replace", rows: [...next] };
  const from = previous.length > 0 && !equal(previous.at(-1), next[previous.length - 1]) ? previous.length - 1 : previous.length;
  return { kind: "update", rows: next.slice(from) };
}
