export const participantOptionMetrics = [
  { key: "net_calls", label: "Net calls", signed: true },
  { key: "net_puts", label: "Net puts", signed: true },
  { key: "options_proxy", label: "Options proxy", signed: true },
  { key: "option_index_call_long", label: "Call long", signed: false },
  { key: "option_index_call_short", label: "Call short", signed: false },
  { key: "option_index_put_long", label: "Put long", signed: false },
  { key: "option_index_put_short", label: "Put short", signed: false },
] as const;

export type ParticipantOptionMetric = (typeof participantOptionMetrics)[number]["key"];
export const participantHistoryOrder = ["FII", "Pro", "Client", "DII"] as const;

type ParticipantHistoryRow = Record<string, unknown>;

const finiteNumber = (candidate: unknown): number | null => {
  if (typeof candidate === "number") return Number.isFinite(candidate) ? candidate : null;
  if (typeof candidate !== "string" || candidate.trim() === "") return null;
  const parsed = Number(candidate);
  return Number.isFinite(parsed) ? parsed : null;
};

export function buildParticipantOptionsHistory(
  rows: readonly ParticipantHistoryRow[],
  metric: ParticipantOptionMetric,
) {
  const dates = [...new Set(rows
    .map((row) => typeof row.trade_date === "string" ? row.trade_date.slice(0, 10) : "")
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)))]
    .sort((left, right) => left.localeCompare(right));
  const readings = new Map<string, number | null>();
  for (const row of rows) {
    const date = typeof row.trade_date === "string" ? row.trade_date.slice(0, 10) : "";
    const participant = String(row.client_type ?? "");
    if (!dates.includes(date) || !participantHistoryOrder.includes(participant as (typeof participantHistoryOrder)[number])) continue;
    readings.set(`${date}|${participant}`, finiteNumber(row[metric]));
  }

  return {
    dates,
    series: participantHistoryOrder.map((participant) => ({
      participant,
      label: participant === "Client" ? "Client (reported)" : participant,
      values: dates.map((date) => readings.get(`${date}|${participant}`) ?? null),
    })),
    observedCount: [...readings.values()].filter((reading) => reading != null).length,
    expectedCount: dates.length * participantHistoryOrder.length,
  };
}
