'use strict';

const MAX_MESSAGE_LENGTH = 1500;
const DEDUPE_TTL_MS = 48 * 60 * 60 * 1000;
const DATA_ALERT_MIN_AFFECTED = 10;
const DATA_ALERT_MIN_DURATION_SECONDS = 1200;
const MATERIAL_ADVERSE_LEVELS = new Set([-1, -2, -5]);

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function first(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function number(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().replace(/[₹$£€,%\s,()]/g, '');
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return /^\(.*\)$/.test(value.trim()) ? -parsed : parsed;
}

function compactNumber(value, digits = 2) {
  const parsed = number(value);
  if (parsed === null) return null;
  return parsed.toFixed(digits).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

function money(value, { signed = false, currency = 'INR' } = {}) {
  const parsed = number(value);
  if (parsed === null) return null;
  const sign = signed ? (parsed > 0 ? '+' : parsed < 0 ? '−' : '') : (parsed < 0 ? '−' : '');
  const formatted = new Intl.NumberFormat('en-IN', {
    style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(Math.abs(parsed));
  return `${sign}${formatted}`;
}

function percent(value, { signed = true, ratio = false, digits = 2 } = {}) {
  let parsed = number(value);
  if (parsed === null) return null;
  if (ratio) parsed *= 100;
  const sign = signed ? (parsed > 0 ? '+' : parsed < 0 ? '−' : '') : (parsed < 0 ? '−' : '');
  return `${sign}${compactNumber(Math.abs(parsed), digits)}%`;
}

function quantity(value) {
  const parsed = number(value);
  return parsed === null ? null : new Intl.NumberFormat('en-IN', { maximumFractionDigits: 8 }).format(parsed);
}

function dateTime(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(parsed).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return `${parts.day} ${parts.month} ${parts.year} · ${parts.hour}:${parts.minute} IST`;
}

function dateOnly(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric',
  }).format(parsed);
}

function timeOnly(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return `${new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(parsed)} IST`;
}

function heldDuration(openedAt, closedAt) {
  const opened = new Date(openedAt);
  const closed = new Date(closedAt);
  if (Number.isNaN(opened.getTime()) || Number.isNaN(closed.getTime()) || closed < opened) return null;
  const minutes = Math.floor((closed - opened) / 60000);
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours ? `${hours}h${remainder ? ` ${remainder}m` : ''}` : `${minutes}m`;
}

function targetDuration(openedAt, hitAt, lifecycle) {
  const opened = new Date(openedAt);
  const hit = new Date(hitAt);
  if (Number.isNaN(opened.getTime()) || Number.isNaN(hit.getTime()) || hit < opened) return null;
  const elapsedMs = hit - opened;
  if (String(lifecycle || '').toUpperCase() === 'SWING') {
    const days = Math.round(elapsedMs / 86400000);
    return `${days} ${days === 1 ? 'day' : 'days'}`;
  }
  const minutes = Math.floor(elapsedMs / 60000);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function present(values, separator = ' · ') {
  return values.filter((value) => value !== undefined && value !== null && value !== '').join(separator);
}

function eventName(payload) {
  return String(first(payload.event_type, payload.type, payload.data?.event_type,
    payload.data?.event_name, payload.event, 'unknown'))
    .toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '');
}

function titleCase(value) {
  return String(value || '').replace(/[._-]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function eventContext(payload) {
  const data = object(first(payload.data, payload.payload, payload));
  const trade = object(first(data.trade, data.trade_group, data.group, data));
  const pnl = object(first(trade.pnl, data.pnl, data.summary?.pnl, data));
  const summary = object(first(data.summary, data.daily_summary, data));
  const suggestion = object(first(data.suggestion, data.signal, data.candidate, data));
  const option = object(first(data.option, data.options, data.structure, suggestion.option, suggestion));
  const eventType = eventName(payload);
  const occurredAt = first(payload.occurred_at, payload.time, payload.timestamp,
    data.occurred_at, data.event_time, data.time);
  return {
    payload, data, trade, pnl, summary, suggestion, option, eventType, occurredAt,
    environment: String(first(payload.environment, data.environment, trade.environment, 'PAPER')).toUpperCase(),
    severity: String(first(payload.severity, data.severity, 'INFO')).toUpperCase(),
    eventId: String(first(payload.event_id, payload.id, data.event_id, `${eventType}:${occurredAt || 'unknown'}`)),
    dedupeKey: String(first(payload.dedupe_key, data.dedupe_key, payload.id, data.event_id,
      `${eventType}:${first(trade.trade_id, data.trade_id, trade.group_id, data.group_id, occurredAt, 'unknown')}`)),
    symbol: first(trade.symbol, trade.underlying, data.symbol, data.underlying, suggestion.symbol, option.underlying),
    side: first(trade.side, data.side, suggestion.side, suggestion.direction),
    strategy: first(trade.strategy_name, trade.strategy_id, data.strategy_name, data.strategy_id,
      suggestion.strategy_name, suggestion.strategy_id),
    strategyVersion: first(trade.strategy_version, data.strategy_version, suggestion.strategy_version),
    tradeId: first(trade.trade_id, data.trade_id),
    groupId: first(trade.group_id, data.group_id),
    clientGroupId: first(trade.client_group_id, data.client_group_id),
    currency: String(first(pnl.currency, trade.currency, data.currency, 'INR')).toUpperCase(),
  };
}

function classify(ctx) {
  const type = ctx.eventType;
  if (type.includes('delivery.test')) return 'DELIVERY_TEST';
  if (type.includes('summary.daily')) return 'DAILY_SUMMARY';
  if (type.includes('summary.weekly')) return 'WEEKLY_SUMMARY';
  if (type.includes('market.data.stale')) return 'DATA_STALE';
  if (type.includes('market.data.recovered')) return 'DATA_RECOVERED';
  if (type.includes('system.processing.error') || type.includes('webhook.dead.letter')) return 'SYSTEM_ERROR';
  if (type.includes('option') && (type.includes('suggest') || type.includes('signal') || type.includes('candidate'))) return 'FNO_SUGGESTION';
  if ((type.includes('fno') || type.includes('straddle') || type.includes('strangle')) &&
      (type.includes('suggest') || type.includes('signal') || type.includes('candidate'))) return 'FNO_SUGGESTION';
  if ((type.includes('stock') || type.includes('equity') || type.includes('oiis')) &&
      (type.includes('suggest') || type.includes('signal') || type.includes('selected'))) return 'EQUITY_SUGGESTION';
  if (type.includes('trade.intent.rejected')) return 'INTENT_REJECTED';
  if (type.includes('trade.intent.accepted')) return 'INTENT_ACCEPTED';
  if (type.includes('pending.entry')) return 'SUPPRESS';
  if (type.includes('execution.target.hit')) return 'SUPPRESS';
  if (type.includes('target.track.closed') || type.includes('target.hit') || type.includes('target.reached')) return 'TARGET_HIT';
  if (type.includes('adverse.threshold') || type.includes('drawdown.threshold')) return 'ADVERSE';
  if (type.includes('trade.group.partially.closed')) return 'PARTIAL_CLOSE';
  if (type.includes('trade.leg.partially.closed')) return 'PARTIAL_CLOSE';
  if (type.includes('trade.group.closed')) return 'FULL_CLOSE';
  if (type.includes('trade.leg.closed')) return 'LEG_CLOSE';
  if (type.includes('trade.group.opened')) return 'GROUP_OPEN';
  if (type.includes('trade.leg.opened') || type.includes('trade.opened') || type.includes('position.opened')) return 'OPEN_FILL';
  if (type.includes('five.session.completed')) return 'HORIZON_5';
  if (type.includes('thirty.session.completed')) return 'HORIZON_30';
  return 'SUPPRESS';
}

function deliveryAllowed(ctx, kind) {
  if (ctx.environment !== 'PAPER') return { allowed: false, reason: 'NON_PAPER' };
  const delivery = object(first(ctx.payload.delivery, ctx.data.delivery));
  const channels = Array.isArray(delivery.channels) ? delivery.channels.map((item) => String(item).toLowerCase()) : null;
  if (delivery.send_whatsapp === false || (channels && !channels.includes('whatsapp'))) {
    return { allowed: false, reason: 'CHANNEL_DISABLED' };
  }
  if (kind === 'SUPPRESS' || kind === 'LEG_CLOSE' || kind === 'INTENT_ACCEPTED') {
    return { allowed: false, reason: 'NOISE_POLICY' };
  }
  if (kind === 'GROUP_OPEN') {
    const legs = Array.isArray(first(ctx.data.legs, ctx.trade.legs)) ? first(ctx.data.legs, ctx.trade.legs) : [];
    const legCount = number(first(ctx.data.leg_count, ctx.trade.leg_count, legs.length));
    if (legCount === null || legCount <= 1) return { allowed: false, reason: 'SINGLE_LEG_OPEN_DUPLICATE' };
  }
  if (kind === 'OPEN_FILL') {
    const legCount = number(first(ctx.data.leg_count, ctx.trade.leg_count));
    if (legCount !== null && legCount > 1) return { allowed: false, reason: 'MULTI_LEG_FILL_AGGREGATED' };
  }
  if (kind === 'SYSTEM_ERROR' && ctx.severity !== 'CRITICAL') return { allowed: false, reason: 'NON_CRITICAL_OPS' };
  if (kind === 'DATA_STALE' || kind === 'DATA_RECOVERED') {
    const affected = number(first(ctx.data.affected_count, ctx.data.instrument_count, 1)) || 1;
    const duration = number(first(ctx.data.duration_seconds, ctx.data.stale_for_seconds, 0)) || 0;
    if (ctx.severity !== 'CRITICAL' && affected < DATA_ALERT_MIN_AFFECTED && duration < DATA_ALERT_MIN_DURATION_SECONDS) {
      return { allowed: false, reason: 'TRANSIENT_DATA_FLAP' };
    }
  }
  if (kind === 'ADVERSE') {
    const risk = object(first(ctx.data.risk, ctx.trade.risk, ctx.data));
    let threshold = number(first(risk.threshold_pct, ctx.data.threshold_pct));
    if (threshold !== null && Math.abs(threshold) < 0.1) threshold *= 100;
    if (threshold === null || !MATERIAL_ADVERSE_LEVELS.has(threshold)) {
      return { allowed: false, reason: 'NON_MATERIAL_ADVERSE_LEVEL' };
    }
  }
  if (kind === 'FNO_SUGGESTION') {
    const decision = String(first(ctx.option.decision, ctx.suggestion.decision, ctx.data.decision, '')).toUpperCase();
    if (['NO_TRADE', 'REJECTED', 'BLOCKED', 'WATCH'].includes(decision)) {
      return { allowed: false, reason: 'NON_ACTIONABLE_FNO_SUGGESTION' };
    }
  }
  return { allowed: true, reason: 'ACTIONABLE' };
}

function identity(ctx) {
  const rawSide = String(ctx.side || '').toUpperCase();
  const direction = rawSide === 'BUY' ? 'LONG (BUY → SELL)'
    : rawSide === 'SELL' ? 'SHORT (SELL → BUY)' : rawSide;
  return present([
    ctx.symbol ? String(ctx.symbol).toUpperCase() : null,
    direction || null,
    ctx.strategy ? String(ctx.strategy).replace(/[_-]+/g, ' ').toUpperCase() : null,
  ]);
}

function nearestTarget(entryPrice, side, pct = 0.3) {
  const entry = number(entryPrice);
  if (entry === null) return null;
  const multiplier = String(side || '').toUpperCase() === 'SELL' ? 1 - pct / 100 : 1 + pct / 100;
  return entry * multiplier;
}

function targetDetails(rawTarget, entryPrice, side, fallbackPct) {
  const target = object(rawTarget);
  let pct = number(first(target.target_pct, target.pct));
  if (pct !== null && Math.abs(pct) < 0.1) pct *= 100;
  if (pct === null) pct = fallbackPct;
  const price = number(first(target.target_price, target.price, nearestTarget(entryPrice, side, pct)));
  return { pct, price };
}

function reasonLabel(value) {
  const code = String(value || '').toUpperCase();
  if (code.includes('INTRADAY_0.003') || code === 'I030') return 'Intraday +0.30% target filled';
  if (code.includes('SWING_0.010') || code === 'S100') return 'Swing +1.00% target filled';
  if (code.includes('TARGET')) return 'Target filled';
  return value ? titleCase(value) : 'Position close completed';
}

function tradeReference(ctx) {
  const ref = first(ctx.clientGroupId, ctx.tradeId, ctx.groupId);
  return ref ? String(ref).replace(/^oiis-/i, '').slice(-32) : null;
}

function targetPercent(ctx) {
  const target = object(first(ctx.data.target, ctx.trade.target, ctx.data));
  const raw = first(target.target_pct, target.pct, ctx.data.target_pct);
  const parsed = number(raw);
  if (parsed === null) return null;
  return ctx.eventType.endsWith('.v1') && Math.abs(parsed) < 0.1 ? parsed * 100 : parsed;
}

function formatSuggestion(ctx, fno = false) {
  const suggestion = ctx.suggestion;
  const option = ctx.option;
  const lines = [`*PAPER ${fno ? 'F&O' : 'EQUITY'} IDEA — ${String(first(option.decision, suggestion.decision, 'SELECTED')).replace(/_/g, ' ').toUpperCase()}*`];
  if (identity(ctx)) lines.push(identity(ctx));
  if (fno) {
    lines.push(present([
      first(option.structure, suggestion.structure) ? `Structure ${String(first(option.structure, suggestion.structure)).replace(/_/g, ' ').toUpperCase()}` : null,
      first(option.expiry, suggestion.expiry) ? `Expiry ${dateOnly(first(option.expiry, suggestion.expiry))}` : null,
      first(option.dte, suggestion.dte) !== undefined ? `DTE ${compactNumber(first(option.dte, suggestion.dte), 0)}` : null,
    ]));
    const legs = Array.isArray(first(option.legs, suggestion.legs)) ? first(option.legs, suggestion.legs) : [];
    for (const leg of legs.slice(0, 4)) {
      lines.push(present([
        `${String(first(leg.side, 'BUY')).toUpperCase()} ${String(first(leg.option_type, leg.type, '')).toUpperCase()} ${first(leg.strike, '')}`.trim(),
        money(first(leg.ask, leg.entry_price, leg.premium), { currency: ctx.currency }),
        first(leg.lot_size) ? `Lot ${quantity(leg.lot_size)}` : null,
      ]));
    }
    lines.push(present([
      money(first(option.combined_premium, option.entry_premium, suggestion.combined_premium), { currency: ctx.currency }) ? `Premium ${money(first(option.combined_premium, option.entry_premium, suggestion.combined_premium), { currency: ctx.currency })}` : null,
      percent(first(option.implied_move_pct, suggestion.implied_move_pct), { signed: false }) ? `Implied ${percent(first(option.implied_move_pct, suggestion.implied_move_pct), { signed: false })}` : null,
      percent(first(option.predicted_p75_move_pct, suggestion.predicted_p75_move_pct), { signed: false }) ? `P75 move ${percent(first(option.predicted_p75_move_pct, suggestion.predicted_p75_move_pct), { signed: false })}` : null,
    ]));
    lines.push(present([
      percent(first(option.expected_return_pct, suggestion.expected_return_pct)) ? `Expected ${percent(first(option.expected_return_pct, suggestion.expected_return_pct))}` : null,
      percent(first(option.probability_of_profit_pct, option.pop_pct, suggestion.probability_of_profit_pct), { signed: false }) ? `PoP ${percent(first(option.probability_of_profit_pct, option.pop_pct, suggestion.probability_of_profit_pct), { signed: false })}` : null,
      percent(first(option.spread_pct, suggestion.spread_pct), { signed: false }) ? `Spread ${percent(first(option.spread_pct, suggestion.spread_pct), { signed: false })}` : null,
    ]));
  } else {
    lines.push(present([
      money(first(suggestion.entry_price, suggestion.entry_limit, ctx.data.entry_price), { currency: ctx.currency }) ? `Entry ${money(first(suggestion.entry_price, suggestion.entry_limit, ctx.data.entry_price), { currency: ctx.currency })}` : null,
      money(first(suggestion.stop_price, suggestion.stop, ctx.data.stop_price), { currency: ctx.currency }) ? `Stop ${money(first(suggestion.stop_price, suggestion.stop, ctx.data.stop_price), { currency: ctx.currency })}` : null,
      percent(first(suggestion.reward_risk, suggestion.rr), { signed: false }) ? `R:R ${compactNumber(first(suggestion.reward_risk, suggestion.rr), 2)}` : null,
    ]));
    lines.push(present([
      first(suggestion.ofactor, ctx.data.ofactor) !== undefined ? `O ${compactNumber(first(suggestion.ofactor, ctx.data.ofactor), 1)}` : null,
      first(suggestion.xfactor, ctx.data.xfactor) !== undefined ? `X ${compactNumber(first(suggestion.xfactor, ctx.data.xfactor), 1)}` : null,
      first(suggestion.data_quality, suggestion.dq, ctx.data.data_quality) !== undefined ? `DQ ${compactNumber(first(suggestion.data_quality, suggestion.dq, ctx.data.data_quality), 1)}` : null,
      first(suggestion.score, ctx.data.score) !== undefined ? `Total ${compactNumber(first(suggestion.score, ctx.data.score), 1)}` : null,
    ]));
    const reason = first(suggestion.reason, suggestion.setup, ctx.data.reason);
    if (reason) lines.push(`Why: ${String(reason).replace(/_/g, ' ')}`);
  }
  if (dateTime(ctx.occurredAt)) lines.push(dateTime(ctx.occurredAt));
  return lines;
}

function formatTradeEvent(ctx, kind) {
  const data = ctx.data;
  const trade = ctx.trade;
  const pnl = ctx.pnl;
  const lines = [];
  const entryPrice = first(trade.entry?.price, trade.entry_price, data.entry_price, data.fill_price);
  const exitPrice = first(trade.exit?.price, trade.exit_price, data.exit_price, data.fill_price);
  const qty = first(trade.quantity, trade.open_quantity, data.quantity, data.fill_quantity, data.closed_quantity);
  const remaining = first(trade.remaining_quantity, data.remaining_quantity);
  const lotSize = first(trade.lot_size, data.lot_size);
  const gross = first(pnl.gross, data.gross_realised_pnl, data.gross_realized_pnl);
  const costs = first(pnl.trading_costs, data.trading_costs);
  const tax = first(pnl.tax_provision, data.income_tax_provision);
  const net = first(pnl.net, pnl.net_after_tax, data.net_after_tax, data.net_realised_pnl);

  if (kind === 'INTENT_ACCEPTED' || kind === 'INTENT_REJECTED') {
    lines.push(`*PAPER TRADE — ${kind === 'INTENT_ACCEPTED' ? 'ACCEPTED' : 'REJECTED'}*`);
    if (identity(ctx)) lines.push(identity(ctx));
    const reason = first(data.reason, data.rejection_reason, data.detail);
    if (kind === 'INTENT_ACCEPTED') {
      lines.push(present([
        quantity(qty) ? `Qty ${quantity(qty)}` : null,
        quantity(lotSize) ? (number(qty) === number(lotSize) ? `1 F&O lot = ${quantity(lotSize)}` : `F&O lot size ${quantity(lotSize)}`) : null,
        entryPrice && money(entryPrice, { currency: ctx.currency }) ? `Reference ${money(entryPrice, { currency: ctx.currency })}` : 'Entry level pending next eligible paper fill',
      ]));
    }
    if (reason) lines.push(`Reason: ${String(reason).slice(0, 300)}`);
  } else if (kind === 'GROUP_OPEN' || kind === 'OPEN_FILL') {
    const symbol = String(ctx.symbol || 'PAPER POSITION').toUpperCase();
    const side = String(ctx.side || '').toUpperCase();
    const openedAt = first(data.fill_time, trade.opened_at, data.opened_at, ctx.occurredAt);
    const tradeValue = number(entryPrice) !== null && number(qty) !== null ? number(entryPrice) * number(qty) : null;
    const activeTarget = targetDetails(first(data.active_exit_target, trade.active_exit_target), entryPrice, side, 0.3);
    const swingTarget = targetDetails(first(data.swing_exit_target, trade.swing_exit_target), entryPrice, side, 1);
    lines.push(`*${symbol} — ${side || 'PAPER'} OPENED*`);
    lines.push('');
    lines.push(`*Entry:* ${money(entryPrice, { currency: ctx.currency }) || '—'}${timeOnly(openedAt) ? ` at ${timeOnly(openedAt)}` : ''}`);
    lines.push(`*Quantity:* ${quantity(qty) || '—'}${quantity(lotSize) && number(qty) === number(lotSize) ? ` (1 F&O lot)` : ''}`);
    if (tradeValue !== null) lines.push(`*Trade value:* ${money(tradeValue, { currency: ctx.currency })}`);
    lines.push('');
    if (activeTarget.price !== null) lines.push(`*Active exit target:* ${money(activeTarget.price, { currency: ctx.currency })} (+${compactNumber(activeTarget.pct, 2)}%)`);
    if (swingTarget.price !== null) lines.push(`*If carried to swing:* ${money(swingTarget.price, { currency: ctx.currency })} (+${compactNumber(swingTarget.pct, 2)}%)`);
    lines.push('');
    if (ctx.strategy) lines.push(`Strategy: ${String(ctx.strategy).replace(/[_-]+/g, ' ').toUpperCase()}${ctx.strategyVersion ? ` • v${ctx.strategyVersion}` : ''}`);
    if (dateOnly(openedAt)) lines.push(dateOnly(openedAt));
    if (tradeReference(ctx)) lines.push(`Trade ref: ${tradeReference(ctx)}`);
  } else if (kind === 'TARGET_HIT') {
    const pct = targetPercent(ctx);
    const tracks = Array.isArray(data.newly_closed_target_tracks) ? data.newly_closed_target_tracks : [];
    const levels = tracks.map((item) => {
      let value = number(item.target_pct);
      if (value !== null && Math.abs(value) < 0.1) value *= 100;
      return value === null ? null : `+${compactNumber(value, 2)}%`;
    }).filter(Boolean);
    lines.push(`*PAPER ANALYTICAL TARGET HIT${pct !== null ? ` — +${compactNumber(pct, 2)}%` : ''}*`);
    if (identity(ctx)) lines.push(identity(ctx));
    if (levels.length) lines.push(`Reached ${levels.join(' · ')}`);
    const firstTrack = object(tracks[0]);
    const targetId = String(first(firstTrack.target_id, firstTrack.target_code, data.target_id, data.target_code, '')).toUpperCase();
    const lifecycle = String(first(firstTrack.lifecycle, data.lifecycle, targetId.startsWith('SWING') ? 'SWING' : 'INTRADAY')).toUpperCase();
    const targetEntry = number(first(data.entry_price, trade.entry_price));
    const targetPrice = number(first(firstTrack.target_price, data.target_price));
    const targetUnits = number(first(data.quantity, trade.quantity));
    const isShort = ['SELL', 'SHORT'].includes(String(ctx.side || '').toUpperCase());
    const profitPerShare = targetEntry !== null && targetPrice !== null
      ? (isShort ? targetEntry - targetPrice : targetPrice - targetEntry) : null;
    const grossProfit = profitPerShare !== null && targetUnits !== null ? profitPerShare * targetUnits : null;
    lines.push(present([
      money(first(data.entry_price, trade.entry_price), { currency: ctx.currency }) ? `Entry ${money(first(data.entry_price, trade.entry_price), { currency: ctx.currency })}` : null,
      money(first(firstTrack.target_price, data.target_price), { currency: ctx.currency }) ? `Target ${money(first(firstTrack.target_price, data.target_price), { currency: ctx.currency })}` : null,
      money(first(firstTrack.observed_price, data.current_price), { currency: ctx.currency }) ? `Observed ${money(first(firstTrack.observed_price, data.current_price), { currency: ctx.currency })}` : null,
    ]));
    lines.push(present([
      `Type ${titleCase(lifecycle)}`,
      targetDuration(first(data.opened_at, trade.opened_at), first(firstTrack.hit_at, data.hit_at, ctx.occurredAt), lifecycle)
        ? `Time to hit ${targetDuration(first(data.opened_at, trade.opened_at), first(firstTrack.hit_at, data.hit_at, ctx.occurredAt), lifecycle)}` : null,
    ]));
    lines.push(present([
      money(profitPerShare, { signed: true, currency: ctx.currency }) ? `Profit/share ${money(profitPerShare, { signed: true, currency: ctx.currency })}` : null,
      money(grossProfit, { signed: true, currency: ctx.currency }) ? `Gross profit ${money(grossProfit, { signed: true, currency: ctx.currency })}` : null,
    ]));
    if (data.actual_execution_position_status) {
      lines.push(`Execution ${String(data.actual_execution_position_status).toUpperCase()}`);
    }
    lines.push('Analytical milestone only · It does not itself close the position');
  } else if (kind === 'PARTIAL_CLOSE') {
    lines.push('*PAPER POSITION — PARTIAL CLOSE*');
    if (identity(ctx)) lines.push(identity(ctx));
    lines.push(present([
      money(exitPrice, { currency: ctx.currency }) ? `Fill ${money(exitPrice, { currency: ctx.currency })}` : null,
      quantity(first(data.closed_quantity, qty)) ? `Closed ${quantity(first(data.closed_quantity, qty))}` : null,
      quantity(remaining) ? `Remaining ${quantity(remaining)}` : null,
    ]));
    if (money(net, { signed: true, currency: ctx.currency })) lines.push(`Net realised ${money(net, { signed: true, currency: ctx.currency })}`);
  } else if (kind === 'FULL_CLOSE') {
    const symbol = String(ctx.symbol || 'PAPER POSITION').toUpperCase();
    const side = String(ctx.side || '').toUpperCase();
    const openedAt = first(trade.opened_at, data.opened_at);
    const closedAt = first(trade.closed_at, data.closed_at, ctx.occurredAt);
    const entry = number(entryPrice);
    const exit = number(exitPrice);
    const units = number(qty);
    const returnPct = number(net) !== null && entry !== null && units !== null && entry * units !== 0
      ? number(net) / (entry * units) * 100 : null;
    lines.push(`*${symbol} — CLOSED | ${number(net) >= 0 ? 'PROFIT' : 'LOSS'}*`);
    if (money(net, { signed: true, currency: ctx.currency })) {
      lines.push(`*Net result:* ${money(net, { signed: true, currency: ctx.currency })}${returnPct !== null ? ` (${percent(returnPct)})` : ''}`);
    }
    lines.push(`${side || 'PAPER'}${quantity(qty) ? ` • ${quantity(qty)}` : ''}`);
    if (money(entryPrice, { currency: ctx.currency })) lines.push(`*Entry:* ${money(entryPrice, { currency: ctx.currency })}${dateTime(openedAt) ? ` at ${dateTime(openedAt)}` : ''}`);
    if (money(exitPrice, { currency: ctx.currency })) lines.push(`*Exit:* ${money(exitPrice, { currency: ctx.currency })}${dateTime(closedAt) ? ` at ${dateTime(closedAt)}` : ''}`);
    if (heldDuration(openedAt, closedAt)) lines.push(`*Held:* ${heldDuration(openedAt, closedAt)}`);
    lines.push(`*Reason:* ${reasonLabel(first(data.exit_reason_code, trade.exit_reason_code, data.exit_reason))}`);
    if (money(gross, { signed: true, currency: ctx.currency })) lines.push(`Gross: ${money(gross, { signed: true, currency: ctx.currency })}`);
    lines.push(present([
      money(costs, { currency: ctx.currency }) ? `Costs: −${money(Math.abs(number(costs)), { currency: ctx.currency })}` : null,
      money(tax, { currency: ctx.currency }) ? `Tax provision: −${money(Math.abs(number(tax)), { currency: ctx.currency })}` : null,
    ], ' • '));
    if (entry !== null && exit !== null && entry !== 0) {
      const rawReturn = (exit / entry - 1) * 100;
      const directionalReturn = String(ctx.side || '').toUpperCase() === 'SELL' ? -rawReturn : rawReturn;
      if (returnPct === null) lines.push(`Price move: ${percent(directionalReturn)}`);
    }
    if (ctx.strategy) lines.push(`Strategy: ${String(ctx.strategy).replace(/[_-]+/g, ' ').toUpperCase()}${ctx.strategyVersion ? ` • v${ctx.strategyVersion}` : ''}`);
    if (tradeReference(ctx)) lines.push(`Trade ref: ${tradeReference(ctx)}`);
    lines.push('5-session and 30-session observation continues');
  } else if (kind === 'ADVERSE') {
    const risk = object(first(data.risk, trade.risk, data));
    lines.push(`*PAPER RISK — ${percent(first(risk.threshold_pct, data.threshold_pct), { ratio: ctx.eventType.endsWith('.v1') }) || 'MATERIAL THRESHOLD'}*`);
    if (identity(ctx)) lines.push(identity(ctx));
    lines.push(present([
      percent(first(risk.observed_pct, risk.mae_pct, data.observed_pct, data.mae_pct), { ratio: ctx.eventType.endsWith('.v1') }) ? `Observed ${percent(first(risk.observed_pct, risk.mae_pct, data.observed_pct, data.mae_pct), { ratio: ctx.eventType.endsWith('.v1') })}` : null,
      money(first(risk.current_price, data.current_price), { currency: ctx.currency }) ? `Mark ${money(first(risk.current_price, data.current_price), { currency: ctx.currency })}` : null,
    ]));
  }
  if (!['GROUP_OPEN', 'OPEN_FILL', 'FULL_CLOSE'].includes(kind)) {
    if (dateTime(ctx.occurredAt)) lines.push(dateTime(ctx.occurredAt));
    if (ctx.tradeId || ctx.groupId) lines.push(`${ctx.tradeId ? 'Trade' : 'Group'} ${String(first(ctx.tradeId, ctx.groupId)).slice(-12)}`);
  }
  return lines;
}

function formatSummary(ctx, weekly = false) {
  const summary = ctx.summary;
  const lines = [`*PAPER TRADING — ${weekly ? 'WEEKLY' : 'DAILY'} SUMMARY*`];
  const summaryDate = first(summary.trade_date, summary.week_ending, ctx.occurredAt);
  if (dateOnly(summaryDate)) lines.push(dateOnly(summaryDate));
  lines.push(present([
    first(summary.requests_received, summary.requests) !== undefined ? `Requests ${quantity(first(summary.requests_received, summary.requests))}` : null,
    first(summary.groups_opened, summary.opened_count) !== undefined ? `Opened ${quantity(first(summary.groups_opened, summary.opened_count))}` : null,
    first(summary.groups_closed, summary.closed_count) !== undefined ? `Closed ${quantity(first(summary.groups_closed, summary.closed_count))}` : null,
    first(summary.open_count, summary.open_trades) !== undefined ? `Open ${quantity(first(summary.open_count, summary.open_trades))}` : null,
  ]));
  const realised = first(summary.net_realised_pnl, summary.net_realized_pnl, summary.net_after_tax);
  const unrealised = first(summary.unrealised_pnl, summary.unrealized_pnl);
  lines.push(present([
    money(realised, { signed: true, currency: ctx.currency }) ? `Realised ${money(realised, { signed: true, currency: ctx.currency })}` : null,
    money(unrealised, { signed: true, currency: ctx.currency }) ? `Unrealised ${money(unrealised, { signed: true, currency: ctx.currency })}` : null,
  ]));
  lines.push(present([
    first(summary.winning_trades, summary.winners) !== undefined ? `Wins ${quantity(first(summary.winning_trades, summary.winners))}` : null,
    first(summary.losing_trades, summary.losers) !== undefined ? `Losses ${quantity(first(summary.losing_trades, summary.losers))}` : null,
    percent(first(summary.win_rate_pct, summary.win_rate), { signed: false }) ? `Win rate ${percent(first(summary.win_rate_pct, summary.win_rate), { signed: false })}` : null,
  ]));
  const stale = first(summary.open_data_incidents, summary.stale_instruments);
  if (number(stale) !== null && number(stale) > 0) lines.push(`Data warning: ${quantity(stale)} unresolved incident(s)`);
  return lines;
}

function formatOperational(ctx, kind) {
  const lines = [];
  if (kind === 'SYSTEM_ERROR') {
    lines.push('*PAPER TRADING — CRITICAL FAILURE*');
    lines.push(present([
      first(ctx.data.component, ctx.data.service) ? `Component ${first(ctx.data.component, ctx.data.service)}` : null,
      first(ctx.data.error_code, ctx.data.code) ? `Code ${first(ctx.data.error_code, ctx.data.code)}` : null,
    ]));
    const message = first(ctx.data.message, ctx.data.error, ctx.data.reason);
    if (message) lines.push(String(message).slice(0, 400));
  } else {
    const recovered = kind === 'DATA_RECOVERED';
    lines.push(`*PAPER MARKET DATA — ${recovered ? 'RECOVERED' : 'SUSTAINED OUTAGE'}*`);
    lines.push(present([
      `Affected ${quantity(first(ctx.data.affected_count, ctx.data.instrument_count, 1))}`,
      first(ctx.data.exchange) ? `Exchange ${ctx.data.exchange}` : null,
      first(ctx.data.duration_seconds, ctx.data.stale_for_seconds) ? `Duration ${compactNumber(first(ctx.data.duration_seconds, ctx.data.stale_for_seconds) / 60, 0)} min` : null,
    ]));
    lines.push(recovered ? 'Collection and paper monitoring have recovered.' : 'New entries are guarded; existing positions remain monitored with last valid data marked stale.');
  }
  if (dateTime(ctx.occurredAt)) lines.push(dateTime(ctx.occurredAt));
  return lines;
}

function dedupe(state, key, nowMs) {
  const store = object(state.paperTradeLowNoiseV3);
  const cutoff = nowMs - DEDUPE_TTL_MS;
  for (const [existingKey, timestamp] of Object.entries(store)) {
    if (!Number.isFinite(Number(timestamp)) || Number(timestamp) < cutoff) delete store[existingKey];
  }
  const duplicate = Boolean(store[key]);
  if (!duplicate) store[key] = nowMs;
  state.paperTradeLowNoiseV3 = store;
  return duplicate;
}

function formatNotification(payload, options = {}) {
  const ctx = eventContext(object(payload));
  const kind = classify(ctx);
  const policy = deliveryAllowed(ctx, kind);
  if (!policy.allowed) return { send: false, reason: policy.reason, event_type: ctx.eventType, kind };

  let lines;
  if (kind === 'DELIVERY_TEST') {
    lines = [
      '*PAPER TRADING — WHATSAPP DELIVERY TEST*',
      'Webhook, n8n workflow and WhatsApp gateway completed the delivery path.',
      dateTime(ctx.occurredAt),
      'Test only · No paper trade was created or changed.',
    ];
  } else if (kind === 'EQUITY_SUGGESTION') lines = formatSuggestion(ctx, false);
  else if (kind === 'FNO_SUGGESTION') lines = formatSuggestion(ctx, true);
  else if (kind === 'DAILY_SUMMARY') lines = formatSummary(ctx, false);
  else if (kind === 'WEEKLY_SUMMARY') lines = formatSummary(ctx, true);
  else if (['SYSTEM_ERROR', 'DATA_STALE', 'DATA_RECOVERED'].includes(kind)) lines = formatOperational(ctx, kind);
  else if (kind === 'HORIZON_5' || kind === 'HORIZON_30') {
    const sessions = kind === 'HORIZON_5' ? 5 : 30;
    lines = [`*PAPER ${sessions}-SESSION OBSERVATION COMPLETE*`];
    if (identity(ctx)) lines.push(identity(ctx));
    lines.push(present([
      percent(first(ctx.data.closing_return, ctx.data.closing_return_pct), { ratio: ctx.eventType.endsWith('.v1') }) ? `Close ${percent(first(ctx.data.closing_return, ctx.data.closing_return_pct), { ratio: ctx.eventType.endsWith('.v1') })}` : null,
    ]));
    if (dateTime(ctx.occurredAt)) lines.push(dateTime(ctx.occurredAt));
  } else lines = formatTradeEvent(ctx, kind);

  let message = lines.filter(Boolean).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (message.length > MAX_MESSAGE_LENGTH) message = `${message.slice(0, MAX_MESSAGE_LENGTH - 32)}\n…full details are in the dashboard`;
  const state = object(options.state);
  const duplicate = dedupe(state, ctx.dedupeKey, first(options.nowMs, Date.now()));
  if (duplicate) return { send: false, reason: 'DUPLICATE', event_type: ctx.eventType, kind };
  return {
    send: true, reason: 'ACTIONABLE', event_id: ctx.eventId, event_type: ctx.eventType,
    dedupe_key: ctx.dedupeKey, kind, whatsapp_message: message,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { classify, deliveryAllowed, eventContext, formatNotification };
}
