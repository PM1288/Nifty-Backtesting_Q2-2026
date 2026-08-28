import { formatDecimal } from "../../lib/format";

export function formatSignedPercent(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  const normalized = Object.is(value, -0) ? 0 : value;
  return `${normalized > 0 ? "+" : ""}${formatDecimal(normalized, 2)}%`;
}
