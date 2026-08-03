export function fmtPct(p: number) {
  const sign = p > 0 ? "+" : "";
  return `${sign}${p.toFixed(2)}%`;
}
export function fmtNum(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
export function fmtTimeHHMM(iso: string) {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}
