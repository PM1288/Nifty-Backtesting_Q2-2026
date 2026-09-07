export const candleColors = {
  color: "#087a55",
  borderColor: "#087a55",
  color0: "#c93346",
  borderColor0: "#c93346",
};
export function chartInterval(value: string | null) {
  return [5, 15, 60].includes(Number(value)) ? Number(value) : 5;
}
export function istDay(value: unknown) {
  const d = new Date(String(value));
  return Number.isFinite(d.getTime())
    ? new Date(d.getTime() + 19800000).toISOString().slice(0, 10)
    : "";
}
export function dayRows<T extends Record<string, unknown>>(
  rows: T[],
  day: string,
  key: string,
) {
  return rows.filter((r) => istDay(r[key]) === day);
}
