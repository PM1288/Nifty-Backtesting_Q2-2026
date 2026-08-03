export function pctClass(changePct: number): string {
  if (changePct > 0) return "pctUp";
  if (changePct < 0) return "pctDown";
  return "pctFlat";
}
