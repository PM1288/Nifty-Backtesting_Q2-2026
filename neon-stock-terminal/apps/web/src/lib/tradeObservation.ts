/** Presentation selectors only. Stored signals/outcomes are never recomputed. */
export type Observation = Record<string, unknown>;
export type Horizon = "15m" | "30m" | "eod";
export const horizons: Horizon[] = ["15m", "30m", "eod"];
export const presets = [
  "Monitor",
  "Outcomes",
  "Entries & rules",
  "Indicators",
  "Full evidence",
] as const;
export const object = (v: unknown): Observation =>
  v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Observation)
    : {};
export function number(v: unknown): number | null {
  if (typeof v !== "number" && typeof v !== "string") return null;
  if (typeof v === "string" && !v.trim()) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
export function numeric(v: unknown, digits = 2, signed = false): string {
  const n = number(v);
  if (n === null) return "—";
  const rounded = Number(n.toFixed(digits));
  return `${signed && rounded > 0 ? "+" : ""}${(Object.is(rounded, -0) ? 0 : rounded).toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}
export const textValue = (v: unknown): string =>
  v == null ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v);
export function time(v: unknown): string {
  if (typeof v !== "string" || !Number.isFinite(Date.parse(v))) return "—";
  return new Date(v).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
export function side(row: Observation): "ce" | "pe" | null {
  const expected =
    row.direction === "CALL" ? "ce" : row.direction === "PUT" ? "pe" : null;
  return expected &&
    typeof row.option_symbol === "string" &&
    row.option_symbol.length > 0 &&
    row.option_symbol === row[`${expected}_symbol`]
    ? expected
    : null;
}
export const windowEvidence = (row: Observation, h: Horizon) =>
  object(object(row.outcome_evidence)[h]);
export const instrumentEvidence = (
  row: Observation,
  h: Horizon,
  instrument: string | null,
) => (instrument ? object(windowEvidence(row, h)[instrument]) : {});
/** Escaped segments avoid collisions between literal dotted keys and nested paths. */
export function flatten(row: Observation, prefix = ""): Observation {
  const out: Observation = {};
  for (const [key, value] of Object.entries(row)) {
    const segment = key.replaceAll("~", "~0").replaceAll(".", "~1");
    const path = prefix ? `${prefix}.${segment}` : segment;
    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length
    )
      Object.assign(out, flatten(object(value), path));
    else out[path] = value;
  }
  return out;
}
export function readState(params: URLSearchParams) {
  const one = (key: string, allowed: readonly string[], fallback: string) =>
    allowed.includes(params.get(key) ?? "") ? params.get(key)! : fallback;
  return {
    date: /^\d{4}-\d{2}-\d{2}$/.test(params.get("logDate") ?? "")
      ? params.get("logDate")!
      : "",
    interval: one("logInterval", ["", "1", "5", "15"], ""),
    direction: one("logDirection", ["", "CALL", "PUT"], ""),
    search: params.get("logSearch") ?? "",
    horizon: one("logHorizon", horizons, "15m") as Horizon,
    preset: one("logPreset", presets, "Monitor"),
    metric: one(
      "logMetric",
      ["endpoint_change_pct", "max_change_pct", "min_change_pct", "underlying"],
      "endpoint_change_pct",
    ),
    maturity: one(
      "logMaturity",
      ["", "MATURE", "DEVELOPING", "DATA_INSUFFICIENT"],
      "",
    ),
    alignment: one(
      "logAlignment",
      ["", "ALIGNED", "OPPOSED", "FLAT", "DATA_INSUFFICIENT"],
      "",
    ),
    delivery: params.get("logDelivery") ?? "",
  };
}
export function filtered(
  rows: Observation[],
  state: ReturnType<typeof readState>,
) {
  return rows.filter((row) => {
    const w = windowEvidence(row, state.horizon);
    return (
      `${row.underlying_symbol ?? ""} ${row.option_symbol ?? ""} ${row.ce_symbol ?? ""} ${row.pe_symbol ?? ""}`
        .toLowerCase()
        .includes(state.search.toLowerCase().trim()) &&
      (!state.maturity ||
        (state.maturity === "DATA_INSUFFICIENT"
          ? instrumentEvidence(row, state.horizon, side(row)).state ===
              "DATA_INSUFFICIENT" || !w.maturity
          : w.maturity === state.maturity)) &&
      (!state.alignment || w.thesis_alignment === state.alignment) &&
      (!state.delivery || row.delivery_status === state.delivery)
    );
  });
}
