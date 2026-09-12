import { numeric, type Facts } from "./tradingAnalytics";

export type UnderlyingReferenceLevel = {
  id: string;
  label: string;
  shortLabel: string;
  value: number;
  sourceDate: string | null;
  source: "daily_bar" | "live_session" | "derived_window";
};

type DailyObservation = { date: string; open: number; high: number; low: number; close: number };

const istDate = (value: string) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date(value));

const weekKey = (date: string) => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - ((value.getUTCDay() + 6) % 7));
  return value.toISOString().slice(0, 10);
};

const validDaily = (row: Facts): DailyObservation | null => {
  const date = String(row.date ?? "").slice(0, 10);
  const open = numeric(row.open), high = numeric(row.high), low = numeric(row.low), close = numeric(row.close);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && open != null && high != null && low != null && close != null && high >= low
    ? { date, open, high, low, close }
    : null;
};

/** Compact, read-only price references derived from canonical daily bars and the observed live session. */
export function underlyingReferenceLevels(dailyRows: Facts[], spot: Facts | null | undefined, asOf: string) {
  const spotTime = spot?.exch_feed_time ?? spot?.exchange_feed_at ?? spot?.ts;
  const today = spotTime != null && Number.isFinite(Date.parse(String(spotTime))) ? istDate(String(spotTime)) : istDate(asOf);
  const completed = dailyRows.flatMap((row) => validDaily(row) ?? []).sort((a, b) => a.date.localeCompare(b.date));
  const byDate = new Map(completed.map((row) => [row.date, row]));
  const currentCompleted = byDate.get(today);
  const liveOpen = numeric(spot?.day_open), liveHigh = numeric(spot?.day_high), liveLow = numeric(spot?.day_low), liveClose = numeric(spot?.ltp);
  const current = currentCompleted ?? (liveOpen != null && liveHigh != null && liveLow != null && liveClose != null && liveHigh >= liveLow
    ? { date: today, open: liveOpen, high: liveHigh, low: liveLow, close: liveClose }
    : null);
  const observations = [...completed.filter((row) => row.date !== today), ...(current ? [current] : [])].sort((a, b) => a.date.localeCompare(b.date));
  const previous = completed.filter((row) => row.date < today).at(-1) ?? null;
  const currentWeek = weekKey(today), currentMonth = today.slice(0, 7);
  const weekRows = observations.filter((row) => weekKey(row.date) === currentWeek);
  const monthRows = observations.filter((row) => row.date.slice(0, 7) === currentMonth);
  const priorWeekKeys = [...new Set(completed.map((row) => weekKey(row.date)).filter((key) => key < currentWeek))].sort();
  const priorMonthKeys = [...new Set(completed.map((row) => row.date.slice(0, 7)).filter((key) => key < currentMonth))].sort();
  const previousWeek = completed.filter((row) => weekKey(row.date) === priorWeekKeys.at(-1));
  const previousMonth = completed.filter((row) => row.date.slice(0, 7) === priorMonthKeys.at(-1));
  const rows5 = observations.slice(-5), rows30 = observations.slice(-30);
  const levels: UnderlyingReferenceLevel[] = [];
  const add = (id: string, label: string, shortLabel: string, value: number | null | undefined, sourceDate: string | null, source: UnderlyingReferenceLevel["source"] = "daily_bar") => {
    if (value != null && Number.isFinite(value)) levels.push({ id, label, shortLabel, value, sourceDate, source });
  };
  add("current", "Current underlying", "NOW", liveClose ?? current?.close, today, currentCompleted ? "daily_bar" : "live_session");
  add("today-open", "Today open", "D O", liveOpen ?? current?.open, today, currentCompleted ? "daily_bar" : "live_session");
  add("previous-day-open", "Yesterday open", "D-1 O", previous?.open, previous?.date ?? null);
  add("previous-day-close", "Yesterday close", "D-1 C", numeric(spot?.previous_close) ?? previous?.close, previous?.date ?? null, numeric(spot?.previous_close) != null ? "live_session" : "daily_bar");
  add("current-week-open", "Current week open", "W O", weekRows[0]?.open, weekRows[0]?.date ?? null);
  add("previous-week-open", "Previous week open", "W-1 O", previousWeek[0]?.open, previousWeek[0]?.date ?? null);
  add("previous-week-close", "Previous week close", "W-1 C", previousWeek.at(-1)?.close, previousWeek.at(-1)?.date ?? null);
  add("current-month-open", "Current month open", "M O", monthRows[0]?.open, monthRows[0]?.date ?? null);
  add("previous-month-open", "Previous month open", "M-1 O", previousMonth[0]?.open, previousMonth[0]?.date ?? null);
  add("previous-month-close", "Previous month close", "M-1 C", previousMonth.at(-1)?.close, previousMonth.at(-1)?.date ?? null);
  if (rows5.length === 5) {
    add("five-day-low", "5-session minimum", "5D MIN", Math.min(...rows5.map((row) => row.low)), rows5[0].date, "derived_window");
    add("five-day-high", "5-session maximum", "5D MAX", Math.max(...rows5.map((row) => row.high)), rows5[0].date, "derived_window");
  }
  if (rows30.length === 30) {
    add("thirty-day-low", "30-session minimum", "30D MIN", Math.min(...rows30.map((row) => row.low)), rows30[0].date, "derived_window");
    add("thirty-day-high", "30-session maximum", "30D MAX", Math.max(...rows30.map((row) => row.high)), rows30[0].date, "derived_window");
  }
  return { asOf, sessionDate: today, levels, coverage: { completedDailyBars: completed.length, observedSessions: observations.length } };
}
