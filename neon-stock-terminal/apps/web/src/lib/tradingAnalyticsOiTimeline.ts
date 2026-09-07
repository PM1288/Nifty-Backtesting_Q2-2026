/** Do not draw an interpolated path across missing quote bins or closed sessions. */
export function oiTimeline(
  rows: Record<string, unknown>[],
): Array<[string, number | null]> {
  const points: Array<[string, number | null]> = [];
  let previous: number | null = null;
  for (const row of rows) {
    const time = Date.parse(String(row.event_time));
    if (!Number.isFinite(time)) continue;
    if (previous != null && time - previous > 30 * 60 * 1000)
      points.push([new Date(previous + 1).toISOString(), null]);
    points.push([
      String(row.event_time),
      row.oi == null ? null : Number(row.oi),
    ]);
    previous = time;
  }
  return points;
}
