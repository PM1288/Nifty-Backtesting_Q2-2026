import { numeric, type Facts } from "./tradingAnalytics";

export type OiLayerState =
  | "COMPARABLE"
  | "CURRENT_ONLY_BASELINE_UNAVAILABLE"
  | "CURRENT_MISSING";

export function oiLayers(baselineInput: unknown, currentInput: unknown) {
  const baseline = numeric(baselineInput);
  const current = numeric(currentInput);
  if (current == null || current < 0)
    return {
      state: "CURRENT_MISSING" as OiLayerState,
      baseline,
      current: null,
      retained: null,
      added: null,
      removed: null,
      change: null,
      changePct: null,
    };
  if (baseline == null || baseline < 0)
    return {
      state: "CURRENT_ONLY_BASELINE_UNAVAILABLE" as OiLayerState,
      baseline: null,
      current,
      retained: null,
      added: null,
      removed: null,
      change: null,
      changePct: null,
    };
  const change = current - baseline;
  return {
    state: "COMPARABLE" as OiLayerState,
    baseline,
    current,
    retained: Math.min(baseline, current),
    added: Math.max(change, 0),
    removed: Math.max(-change, 0),
    change,
    changePct: baseline === 0 ? null : (100 * change) / baseline,
  };
}

export function aggregateOi(rows: Facts[]): Facts {
  const ids = rows.map((r) => String(r.contractId ?? r.symbol_token ?? ""));
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length)
    return { state: "INVALID_COHORT", contractCount: rows.length };
  const layers = rows.map((r) =>
    oiLayers(r.baseline_open_interest, r.open_interest),
  );
  const current = layers.every((r) => r.current != null)
    ? layers.reduce((sum, r) => sum + r.current!, 0)
    : null;
  const baseline = layers.every((r) => r.baseline != null)
    ? layers.reduce((sum, r) => sum + r.baseline!, 0)
    : null;
  const aggregate = oiLayers(baseline, current);
  const comparable = layers.every((r) => r.state === "COMPARABLE");
  return {
    ...aggregate,
    state: comparable ? aggregate.state : "PARTIAL_BASELINE",
    contractCount: rows.length,
    comparableCount: layers.filter((r) => r.state === "COMPARABLE").length,
    grossAdded: comparable
      ? layers.reduce((sum, r) => sum + r.added!, 0)
      : null,
    grossRemoved: comparable
      ? layers.reduce((sum, r) => sum + r.removed!, 0)
      : null,
  };
}

export function oiTimeChanges(
  rows: Facts[],
  baselineInput?: unknown,
) {
  const sorted = [...rows].sort((a, b) =>
    String(a.event_time).localeCompare(String(b.event_time)),
  );
  const baseline =
    baselineInput === undefined ? numeric(sorted[0]?.oi) : numeric(baselineInput);
  return sorted.map((row, index) => {
    const current = numeric(row.oi);
    const previous = index ? numeric(sorted[index - 1].oi) : null;
    return {
      ...row,
      current,
      interval_change:
        current == null || previous == null ? null : current - previous,
      cumulative_change:
        current == null || baseline == null ? null : current - baseline,
      baseline,
      baseline_event_time: sorted[0]?.event_time ?? null,
    };
  });
}

/** Select the last eligible quote in each calendar-anchored interval. */
export function sessionAlignedOi(
  rows: Facts[],
  sessions: Facts[],
  intervalMinutes: number,
  asOf: string,
) {
  const cutoff = Date.parse(asOf);
  const prepared = rows
    .map((row) => ({
      row,
      event: Date.parse(String(row.event_time ?? row.exch_feed_time)),
      collected: Date.parse(String(row.collected_at ?? row.ts)),
    }))
    .filter(
      (item) =>
        Number.isFinite(item.event) &&
        Number.isFinite(item.collected) &&
        item.event <= cutoff &&
        item.collected <= cutoff,
    )
    .sort((a, b) => a.event - b.event || a.collected - b.collected);
  const endpoints: Facts[] = [];
  for (const session of sessions) {
    const open = Date.parse(String(session.market_open_ts));
    const close = Math.min(Date.parse(String(session.market_close_ts)), cutoff);
    if (!Number.isFinite(open) || !Number.isFinite(close) || close <= open) continue;
    // Walk the ordered observations once per session. Filtering the complete
    // quote set for every interval made this endpoint intervals x quotes.
    // Boundary semantics remain unchanged: an event at an interval end belongs
    // to that interval and is not carried into the following interval.
    let cursor = prepared.findIndex((item) => item.event >= open);
    if (cursor < 0) cursor = prepared.length;
    for (let start = open; start < close; start += intervalMinutes * 60_000) {
      const end = Math.min(start + intervalMinutes * 60_000, close);
      let selected: (typeof prepared)[number] | undefined;
      while (cursor < prepared.length && prepared[cursor].event <= end) {
        const item = prepared[cursor++];
        if (item.event > start || (start === open && item.event === open))
          selected = item;
      }
      endpoints.push({
        event_time: new Date(end).toISOString(),
        interval_start: new Date(start).toISOString(),
        selected_event_time: selected
          ? new Date(selected.event).toISOString()
          : null,
        collected_at: selected
          ? new Date(selected.collected).toISOString()
          : null,
        oi: selected?.row.oi ?? null,
        state: selected ? "OBSERVED_ENDPOINT" : "MISSING_ENDPOINT",
        source_age_seconds: selected ? (end - selected.event) / 1000 : null,
      });
    }
  }
  return oiTimeChanges(endpoints);
}

export function participantComparison(current: Facts[], previous: Facts[]): Facts[] {
  const priorByClient = new Map(
    previous.map((row) => [String(row.client_type), row]),
  );
  return current.map((row) => {
    const prior = priorByClient.get(String(row.client_type));
    const delta = (key: string) => {
      const a = numeric(row[key]);
      const b = numeric(prior?.[key]);
      return a == null || b == null ? null : a - b;
    };
    const futuresLongPctChange =
      numeric(row.futures_long_pct) == null ||
      numeric(prior?.futures_long_pct) == null
        ? null
        : numeric(row.futures_long_pct)! - numeric(prior!.futures_long_pct)!;
    return {
      ...row,
      comparison_state: prior ? "COMPARABLE_PREVIOUS_REPORT" : "BASELINE_MISSING",
      previous_trade_date: prior?.trade_date ?? null,
      previous_run_id: prior?.run_id ?? null,
      previous_net_futures: prior?.net_futures ?? null,
      previous_options_proxy: prior?.options_proxy ?? null,
      delta_net_futures: delta("net_futures"),
      delta_options_proxy: delta("options_proxy"),
      futures_long_pct_change_pp: futuresLongPctChange,
    };
  });
}
