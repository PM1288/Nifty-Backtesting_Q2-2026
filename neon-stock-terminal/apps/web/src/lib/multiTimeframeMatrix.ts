export const MATRIX_INTERVALS = [1, 5, 15] as const;
export type MatrixInterval = (typeof MATRIX_INTERVALS)[number];
export const MATRIX_SIDES = ["UNDERLYING", "CE", "PE"] as const;
export type MatrixSide = (typeof MATRIX_SIDES)[number];

type Row = Record<string, unknown>;
export type MatrixPane = {
  identity: Row;
  bars: Row[];
  sourceMinuteCount: number;
};

export function istDateFromTimestamp(value: string) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(time);
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  const year = part("year"), month = part("month"), day = part("day");
  return year && month && day ? `${year}-${month}-${day}` : null;
}

/** An expired browser-only pin must never strand the live board on last week's
 * contract. Current and future explicit pins are preserved. */
export function activeChartExpiry(requested: string | null, current: string, asOf: string) {
  const tradingDay = istDateFromTimestamp(asOf);
  if (!requested) return current;
  if (tradingDay && requested < tradingDay && current >= tradingDay) return current;
  return requested;
}

export function matrixSide(identity: Row): MatrixSide {
  const symbol = String(identity.tradingsymbol ?? "").toUpperCase();
  if (symbol.endsWith("CE")) return "CE";
  if (symbol.endsWith("PE")) return "PE";
  return "UNDERLYING";
}

export function latestIstDay(panes: MatrixPane[]) {
  return panes
    .flatMap((pane) => pane.bars)
    .map((bar) => {
      const time = Date.parse(String(bar.end));
      if (!Number.isFinite(time)) return null;
      return istDateFromTimestamp(new Date(time).toISOString());
    })
    .filter((day): day is string => day != null)
    .sort()
    .at(-1) ?? null;
}

export function barsForIstDay(rows: Row[], day: string | null) {
  if (!day) return [];
  return rows.filter((row) => {
    const time = Date.parse(String(row.end));
    if (!Number.isFinite(time)) return false;
    const formatted = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(time);
    const value = (type: string) => formatted.find((part) => part.type === type)?.value;
    return `${value("year")}-${value("month")}-${value("day")}` === day;
  });
}

/** A lower-frequency candle represents the hovered wall-clock instant when its
 * completed interval ends at or immediately after that instant. */
export function containingBar(rows: Row[], isoTime: string | null) {
  if (!isoTime) return null;
  const target = Date.parse(isoTime);
  if (!Number.isFinite(target)) return null;
  const closed = rows
    .filter((row) => row.closed === true && Number.isFinite(Date.parse(String(row.end))))
    .sort((a, b) => Date.parse(String(a.end)) - Date.parse(String(b.end)));
  return closed.find((row) => Date.parse(String(row.end)) >= target) ?? closed.at(-1) ?? null;
}
