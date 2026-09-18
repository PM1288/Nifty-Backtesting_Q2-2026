export type Row = Record<string, any>;
export const HOLIDAY_SOURCE = "https://nsearchives.nseindia.com/content/circulars/CMTR71775.pdf";
const holidays = new Set(["2026-01-26", "2026-03-03", "2026-03-26", "2026-03-31", "2026-04-03", "2026-04-14", "2026-05-01", "2026-05-28", "2026-06-26", "2026-09-14", "2026-10-02", "2026-10-20", "2026-11-10", "2026-11-24", "2026-12-25"]);
export const finite = (value: unknown): number | null => value == null || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
export const istDate = (value: unknown) => new Date(new Date(String(value)).getTime() + 330 * 60000).toISOString().slice(0, 10);
const ms = (value: unknown) => value == null ? NaN : new Date(String(value)).getTime();
const closeAt = (date: string) => `${date}T10:00:00.000Z`;

export function cashSessions(entryDate: string, count: number): string[] {
  const dates: string[] = [];
  const start = ms(`${entryDate}T00:00Z`);
  if (!Number.isFinite(start)) return dates;
  for (let index = 0; index < 100 && dates.length < count; index++) {
    const day = new Date(start + index * 86400000);
    const date = day.toISOString().slice(0, 10);
    // The verified schedule is deliberately bounded, not a guessed next-year calendar.
    if (!date.startsWith("2026-")) break;
    if (day.getUTCDay() !== 0 && day.getUTCDay() !== 6 && !holidays.has(date)) dates.push(date);
  }
  return dates;
}

export function verifyTradeSessions(trade: Row, asOf: string) {
  const entryAt = ms(trade.opened_at);
  const entry = finite(trade.average_entry_price);
  const date = istDate(trade.opened_at);
  const dates = cashSessions(date, 30);
  const observed = new Map<string, Row>((trade.sessions ?? []).map((session: Row) => [String(session.date), session]));
  const openingFills = (trade.fills ?? []).filter((fill: Row) => fill.position_effect === "OPEN");
  const sourceValid = trade.exchange === "NSE" && trade.segment === "CASH" && trade.quantity_unit === "SHARES" && entry != null && entry > 0 && dates[0] === date && openingFills.length === 1 && finite(openingFills[0].price) === entry && ms(openingFills[0].filled_at) === entryAt && finite(openingFills[0].quantity) === finite(trade.total_units);
  const direction = trade.side === "SELL" ? -1 : 1;
  const sessions: Row[] = dates.map((day, index) => {
    const retained = observed.get(day);
    const source = retained && ms(retained.last_at) + 60000 <= ms(asOf) ? retained : undefined;
    const start = index === 0 ? Math.max(ms(`${day}T03:45Z`), Math.ceil(entryAt / 60000) * 60000) : ms(`${day}T03:45Z`);
    const expected = Math.max(0, Math.round((ms(closeAt(day)) - start) / 60000));
    const count = Number(source?.valid_count ?? 0);
    const complete = expected > 0 && count === expected && ms(asOf) >= ms(closeAt(day)) && source?.last_at && ms(source.last_at) === ms(closeAt(day)) - 60000 && Number(source?.invalid_count ?? 0) === 0;
    return { ...source, date: day, index, expected, valid_count: count, complete: Boolean(complete), close_at: closeAt(day) };
  });
  const horizon = (count: number) => {
    const window = sessions.slice(0, count);
    const invalid = !sourceValid || window.some((day) => Number(day.invalid_count ?? 0) > 0);
    const complete = dates.length >= count && window.every((day) => day.complete);
    const highs = window.map((day) => finite(day.high)).filter((value): value is number => value != null && value > 0);
    const lows = window.map((day) => finite(day.low)).filter((value): value is number => value != null && value > 0);
    const final = window.at(-1);
    const price = complete ? finite(final?.close) : null;
    return { horizon_sessions: count, status: invalid ? "DATA_INVALID" : complete ? "VERIFIED_COMPLETE" : "CENSORED", expected_end_at: dates.length >= count ? closeAt(dates[count - 1]) : null,
      complete_sessions: window.filter((day) => day.complete).length,
      observed_sessions: window.filter((day) => day.valid_count > 0).length,
      expected_bars: window.reduce((sum, day) => sum + day.expected, 0), valid_bars: window.reduce((sum, day) => sum + day.valid_count, 0),
      observed_mfe_pct: entry && highs.length && lows.length ? (direction === 1 ? Math.max(...highs) / entry - 1 : 1 - Math.min(...lows) / entry) * 100 : null,
      observed_mae_pct: entry && highs.length && lows.length ? (direction === 1 ? Math.min(...lows) / entry - 1 : 1 - Math.max(...highs) / entry) * 100 : null,
      closing_price: price, closing_return_pct: price && entry ? direction * (price / entry - 1) * 100 : null,
      raw: (trade.horizons ?? []).find((item: Row) => Number(item.horizon_sessions) === count) ?? null };
  };
  const opportunities = [0.003, 0.004, 0.005, 0.01].map((target) => ({ lifecycle: "INTRADAY", target }))
    .concat([0.01, 0.02, 0.03].map((target) => ({ lifecycle: "SWING", target }))).map(({ lifecycle, target }) => {
      const window = lifecycle === "INTRADAY" ? sessions.slice(0, 1) : sessions.slice(1, 30);
      const hit = window.flatMap((day) => (day.hits ?? []).filter((item: Row) => Number(item.target) === target && ms(item.at) <= ms(asOf))).sort((left: Row, right: Row) => ms(left.at) - ms(right.at))[0];
      const invalid = !sourceValid || window.some((day) => Number(day.invalid_count ?? 0) > 0);
      const complete = window.length === (lifecycle === "INTRADAY" ? 1 : 29) && window.every((day) => day.complete);
      const stored = (trade.targets ?? []).find((item: Row) => item.lifecycle === lifecycle && Number(item.target_pct) === target);
      const recordedHit = stored?.first_hit_at && ms(stored.first_hit_at) <= ms(asOf);
      return { lifecycle, target_pct: target, status: invalid ? "DATA_INVALID" : hit ? "HIT" : complete ? "MISS" : "CENSORED", hit_at: hit?.at ?? null,
        minutes_to_hit: hit ? (ms(hit.at) - entryAt) / 60000 : null, complete_window: complete,
        recorded_hit_at: recordedHit ? stored.first_hit_at : null, disagreement: Boolean(recordedHit) !== Boolean(hit),
        execution: "NOT_INFERRED_FROM_TOUCH" };
    });
  return { sourceValid, sessions, horizons: [horizon(5), horizon(30)], opportunities, calendar_source: HOLIDAY_SOURCE, price_basis: "UNADJUSTED_CANONICAL_MINUTE_START_BARS", knowledge_basis: "RETAINED_RETROSPECTIVE_NOT_KNOWN_AT_TIME" };
}

export function monthlyMembership(trade: Row, candidates: Row[], knownAtEntry = false) {
  const month = istDate(trade.opened_at).slice(0, 7);
  const matches = candidates.filter((candidate) => candidate.symbol === trade.symbol && String(candidate.evaluation_month).slice(0, 7) === month);
  if (!matches.length) return { included: false, reason: "NO_MONTHLY_CANDIDATE", month };
  const timelySignal = matches.filter((candidate) => String(candidate.signal_date).slice(0, 10) <= istDate(trade.opened_at));
  if (!timelySignal.length) return { included: false, reason: "SIGNAL_AFTER_ENTRY", month };
  const supported = timelySignal.filter((candidate) => Array.isArray(candidate.conditions) && candidate.conditions.filter((item: Row) => !item.informational).length > 0 && candidate.conditions.filter((item: Row) => !item.informational).every((item: Row) => item.pass === true));
  if (!supported.length) return { included: false, reason: "FAILED_OR_MISSING_GATE_EVIDENCE", month };
  const known = supported.filter((candidate) => ms(candidate.created_at) <= ms(trade.opened_at) && ms(candidate.updated_at) <= ms(trade.opened_at));
  if (knownAtEntry && !known.length) return { included: false, reason: "QUALIFICATION_NOT_RECORDED_BEFORE_ENTRY", month };
  return { included: true, reason: knownAtEntry ? "RECORDED_BEFORE_ENTRY" : "RETROSPECTIVE_MONTHLY_MATCH", month, candidate_ids: (knownAtEntry ? known : supported).map((candidate) => candidate.candidate_id), direction_confirmed: trade.side === "BUY" };
}

export function replayRecordedCapital(trades: Row[], allocation: number, asOf: string, options: { feesBps?: number; slippageBps?: number; oneIssuer?: boolean } = {}) {
  if (![100000, 200000].includes(allocation)) throw new Error("Allocation must be ₹1 lakh or ₹2 lakh");
  const startingCash = 400000;
  let cash = startingCash, realisedGross = 0, costs = 0, peak = startingCash, drawdown = 0;
  const active = new Map<string, Row>(), positions: Row[] = [], decisions: Row[] = [], events: Row[] = [];
  const fees = (options.feesBps ?? 0) / 10000, slip = (options.slippageBps ?? 0) / 10000;
  const ordered: Row[] = [];
  for (const trade of trades) {
    const entryAt = ms(trade.opened_at);
    if (!Number.isFinite(entryAt) || entryAt > ms(asOf)) continue;
    ordered.push({ kind: "ENTRY", at: trade.opened_at, trade });
    for (const fill of trade.fills ?? []) if (fill.position_effect === "CLOSE" && ms(fill.filled_at) > entryAt && ms(fill.filled_at) <= ms(asOf)) ordered.push({ kind: "EXIT", at: fill.filled_at, fill, trade });
    for (const session of trade.verified?.sessions ?? []) if (session.close && ms(session.last_at) >= entryAt && ms(session.last_at) + 60000 <= ms(asOf)) ordered.push({ kind: "MARK", at: new Date(ms(session.last_at) + 60000).toISOString(), mark: session.close, trade });
  }
  ordered.sort((a, b) => ms(a.at) - ms(b.at) || ({ EXIT: 0, ENTRY: 1, MARK: 2 }[a.kind as "EXIT"] - { EXIT: 0, ENTRY: 1, MARK: 2 }[b.kind as "EXIT"]) || String(a.trade.trade_leg_id).localeCompare(String(b.trade.trade_leg_id)));
  const equity = () => cash + [...active.values()].reduce((sum, position) => sum + position.entry_price * position.remaining + position.direction * (position.mark - position.entry_price) * position.remaining, 0);
  for (const event of ordered) {
    const trade = event.trade, id = String(trade.trade_leg_id);
    const position = active.get(id);
    if (event.kind === "ENTRY") {
      let reason = "TAKEN";
      const entry = finite(trade.average_entry_price), units = finite(trade.total_units);
      if (!trade.verified?.sourceValid || !entry || !units || units <= 0 || !["BUY", "SELL"].includes(trade.side)) reason = "INVALID_ENTRY_EVIDENCE";
      else if (options.oneIssuer && [...active.values()].some((item) => item.symbol === trade.symbol)) reason = "ISSUER_ALREADY_OPEN";
      else if (cash + 1e-8 < allocation) reason = "INSUFFICIENT_FREE_CAPITAL";
      else if (Math.floor(allocation / (entry * (1 + fees + slip))) < 1) reason = "PRICE_EXCEEDS_ALLOCATION";
      decisions.push({ trade_leg_id: id, trade_group_id: trade.trade_group_id, symbol: trade.symbol, at: event.at, reason });
      if (reason !== "TAKEN") continue;
      const direction = trade.side === "SELL" ? -1 : 1;
      const quantity = Math.floor(allocation / (entry! * (1 + fees + slip)));
      const friction = entry! * quantity * (fees + slip);
      costs += friction; cash -= entry! * quantity + friction;
      const opened = { trade_leg_id: id, trade_group_id: trade.trade_group_id, symbol: trade.symbol, sector: trade.sector ?? "Unavailable", side: trade.side, direction, entry_at: event.at, entry_price: entry!, quantity, remaining: quantity, deployed: entry! * quantity, mark: entry!, mark_at: event.at, mark_available: false, realised_gross: 0, costs: friction, status: "OPEN", exit_events: [], short_feasibility: direction === -1 ? "CASH_SHORT_BORROW_UNVERIFIED" : "NOT_APPLICABLE" };
      active.set(id, opened); positions.push(opened);
    } else if (position && event.kind === "MARK") {
      const price = finite(event.mark);
      if (price && price > 0) { position.mark = price; position.mark_at = event.at; position.mark_available = true; }
    } else if (position && event.kind === "EXIT") {
      const price = finite(event.fill.price), fillUnits = finite(event.fill.quantity), total = finite(trade.total_units);
      if (!price || price <= 0 || !fillUnits || fillUnits <= 0 || !total || total <= 0) continue;
      // Pro-rata scaling preserves partial exits; no target touch releases cash.
      const quantity = Math.min(position.remaining, position.quantity * fillUnits / total);
      const gross = position.direction * (price - position.entry_price) * quantity;
      const friction = price * quantity * (fees + slip);
      cash += position.entry_price * quantity + gross - friction;
      realisedGross += gross; costs += friction;
      position.realised_gross += gross; position.costs += friction; position.remaining -= quantity;
      position.exit_events.push({ at: event.at, price, quantity, paper_fill_id: event.fill.paper_fill_id, capital_released: position.entry_price * quantity + gross - friction });
      if (position.remaining < 1e-8) { position.remaining = 0; position.status = "CLOSED"; active.delete(id); }
    }
    const value = equity(); peak = Math.max(peak, value); drawdown = Math.max(drawdown, peak - value);
    events.push({ at: event.at, event: event.kind, symbol: trade.symbol, cash, deployed: [...active.values()].reduce((sum, item) => sum + item.entry_price * item.remaining, 0), equity: value, open_positions: active.size });
  }
  const endingEquity = equity();
  const openMarkedGross = [...active.values()].reduce((sum, position) => sum + position.direction * (position.mark - position.entry_price) * position.remaining, 0);
  return { starting_cash: startingCash, allocation, as_of: asOf, ending_cash: cash, ending_equity: endingEquity, realised_gross: realisedGross, open_marked_gross: openMarkedGross, estimated_costs: costs, net_pnl: endingEquity - startingCash, return_pct: (endingEquity / startingCash - 1) * 100, peak_equity: peak, max_sampled_drawdown: drawdown,
    taken: positions.length, skipped: decisions.filter((item) => item.reason !== "TAKEN").length, open_positions: active.size, unmarked_open_positions: [...active.values()].filter((position) => !position.mark_available).length, decisions, positions, equity_events: events,
    assumptions: { exits: "RECORDED_CLOSING_FILLS_ONLY", marks: "RETAINED_VALID_SESSION_LAST_BARS", intraday_drawdown: "NOT_MEASURED", fractionally_scaled_partial_exits: true, fees_bps: options.feesBps ?? 0, slippage_bps: options.slippageBps ?? 0, actual_costs_included: false, tax_reserve_included: false, short_borrow_verified: false } };
}
