/** Do not draw an interpolated path across missing quote bins or closed sessions. */
export function oiTimeline(
  rows: Record<string, unknown>[],
  field = "current",
): Array<[string, number | null]> {
  const points: Array<[string, number | null]> = [];
  let previousDay: string | null = null;
  for (const row of rows) {
    const time = Date.parse(String(row.event_time));
    if (!Number.isFinite(time)) continue;
    const day = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(time));
    // A retained quote stream can jump between sessions.  Add a deliberate
    // null endpoint so ECharts never implies an overnight continuous OI path.
    if (previousDay != null && day !== previousDay)
      points.push([String(row.event_time), null]);
    const value = row[field] ?? (field === "current" ? row.oi : null);
    points.push([
      String(row.event_time),
      value == null ? null : Number(value),
    ]);
    previousDay = day;
  }
  return points;
}
