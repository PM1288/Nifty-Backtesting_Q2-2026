'use strict';

const assert = require('node:assert/strict');
const { formatNotification } = require('./notification_policy_v3');

const NOW = Date.parse('2026-08-11T11:00:00Z');

function cloudEvent(type, data = {}, extra = {}) {
  return {
    specversion: '1.0',
    id: extra.id || `evt-${type}-${Math.random()}`,
    type,
    time: extra.time || '2026-08-11T10:30:00Z',
    environment: extra.environment || 'PAPER',
    severity: extra.severity || 'INFO',
    data: { environment: extra.environment || 'PAPER', ...data },
  };
}

function run(payload, state = {}) {
  return formatNotification(payload, { state, nowMs: NOW });
}

const tests = [];
function test(name, body) { tests.push({ name, body }); }

test('suppresses transient per-instrument stale and recovery flaps', () => {
  const stale = run(cloudEvent('com.papertrading.market_data.stale.v1', {
    affected_count: 1, instrument_token: '14299', stale_for_seconds: 181,
  }));
  const recovered = run(cloudEvent('com.papertrading.market_data.recovered.v1', {
    affected_count: 1, instrument_token: '14299', duration_seconds: 20,
  }));
  assert.equal(stale.send, false);
  assert.equal(stale.reason, 'TRANSIENT_DATA_FLAP');
  assert.equal(recovered.send, false);
});

test('sends one sustained aggregate data outage and recovery', () => {
  const state = {};
  const payload = cloudEvent('com.papertrading.market_data.stale.v1', {
    affected_count: 17, duration_seconds: 720, exchange: 'NSE',
  }, { id: 'data-outage-1', severity: 'CRITICAL' });
  const first = run(payload, state);
  const second = run(payload, state);
  assert.equal(first.send, true);
  assert.match(first.whatsapp_message, /SUSTAINED OUTAGE/);
  assert.equal(second.send, false);
  assert.equal(second.reason, 'DUPLICATE');
});

test('suppresses generic and operational warning events', () => {
  assert.equal(run(cloudEvent('com.papertrading.worker.heartbeat.v1')).send, false);
  assert.equal(run(cloudEvent('com.papertrading.system.processing_error.v1', {
    message: 'temporary retry',
  }, { severity: 'WARNING' })).send, false);
});

test('formats critical processing failure without raw payload dump', () => {
  const result = run(cloudEvent('com.papertrading.system.processing_error.v1', {
    component: 'paper-monitor', error_code: 'CURSOR_STALLED', message: 'Cursor has not advanced.',
    stack_trace: 'must-not-be-shown',
  }, { severity: 'CRITICAL' }));
  assert.equal(result.send, true);
  assert.match(result.whatsapp_message, /CRITICAL FAILURE/);
  assert.doesNotMatch(result.whatsapp_message, /stack_trace|must-not-be-shown/);
});

test('formats an actionable equity selection with factors and controls', () => {
  const result = run(cloudEvent('com.papertrading.equity.suggestion.selected.v1', {
    symbol: 'TITAN', direction: 'LONG', strategy_id: 'OIIS_LIVE', decision: 'SELECTED',
    entry_limit: '3924.50', stop_price: '3880.00', reward_risk: '2.4',
    ofactor: '74.3', xfactor: '71.2', data_quality: '96.0', score: '241.5',
    setup: 'PULLBACK_CONTINUATION',
  }));
  assert.equal(result.send, true);
  assert.match(result.whatsapp_message, /PAPER EQUITY IDEA/);
  assert.match(result.whatsapp_message, /TITAN · LONG · OIIS LIVE/);
  assert.match(result.whatsapp_message, /O 74.3 · X 71.2 · DQ 96 · Total 241.5/);
});

test('formats actionable F&O structure with legs and economic edge', () => {
  const result = run(cloudEvent('com.papertrading.fno.option.suggestion.v1', {
    underlying: 'SBIN', strategy_id: 'FNO_VOLATILITY', decision: 'BUY_STRADDLE',
    structure: 'ATM_STRADDLE', expiry: '2026-08-25', dte: 14,
    legs: [
      { side: 'BUY', option_type: 'CE', strike: '1070', ask: '18.20', lot_size: 750 },
      { side: 'BUY', option_type: 'PE', strike: '1070', ask: '17.80', lot_size: 750 },
    ],
    combined_premium: '36.00', implied_move_pct: '3.36', predicted_p75_move_pct: '4.20',
    expected_return_pct: '7.4', probability_of_profit_pct: '59', spread_pct: '2.7',
  }));
  assert.equal(result.send, true);
  assert.match(result.whatsapp_message, /PAPER F&O IDEA — BUY STRADDLE/);
  assert.match(result.whatsapp_message, /BUY CE 1070/);
  assert.match(result.whatsapp_message, /Expected \+7.4% · PoP 59% · Spread 2.7%/);
});

test('suppresses one-message-per-candidate F&O NO_TRADE noise', () => {
  const result = run(cloudEvent('com.papertrading.fno.option.suggestion.v1', {
    underlying: 'ABC', decision: 'NO_TRADE', reason: 'premium too expensive',
  }));
  assert.equal(result.send, false);
  assert.equal(result.reason, 'NON_ACTIONABLE_FNO_SUGGESTION');
});

test('suppresses acceptance noise and sends a stock-first fill', () => {
  const accepted = run(cloudEvent('com.papertrading.trade_intent.accepted.v1', {
    symbol: 'GRASIM', side: 'BUY', strategy_id: 'OIIS_LIVE', trade_id: 'trade-1',
    quantity: '250', lot_size: '250',
  }));
  const filled = run(cloudEvent('com.papertrading.trade_leg.opened.v1', {
    symbol: 'GRASIM', side: 'BUY', strategy_id: 'OIIS_LIVE', trade_id: 'trade-1',
    fill_price: '2815.40', fill_quantity: '250', lot_size: '250',
    fill_time: '2026-08-11T05:35:00Z', strategy_version: '3.7',
    client_group_id: 'oiis-2026-08-11-grasim',
    active_exit_target: { target_pct: '0.003', target_price: '2823.8462' },
    swing_exit_target: { target_pct: '0.01', target_price: '2843.554' },
  }));
  assert.equal(accepted.send, false);
  assert.equal(accepted.reason, 'NOISE_POLICY');
  assert.match(filled.whatsapp_message, /\*GRASIM — BUY OPENED\*/);
  assert.match(filled.whatsapp_message, /\*Entry:\* ₹2,815.40 at 11:05 IST/);
  assert.match(filled.whatsapp_message, /\*Quantity:\* 250 \(1 F&O lot\)/);
  assert.match(filled.whatsapp_message, /\*Trade value:\* ₹7,03,850.00/);
  assert.match(filled.whatsapp_message, /\*Active exit target:\* ₹2,823.85 \(\+0.3%\)/);
  assert.match(filled.whatsapp_message, /Strategy: OIIS LIVE • v3.7/);
  assert.match(filled.whatsapp_message, /Trade ref: 2026-08-11-grasim/);
});

test('suppresses duplicate single-leg group open and aggregates multi-leg group open', () => {
  const single = run(cloudEvent('com.papertrading.trade_group.opened.v1', {
    symbol: 'GRASIM', side: 'LONG', group_id: 'group-single',
  }));
  const multi = run(cloudEvent('com.papertrading.trade_group.opened.v1', {
    symbol: 'SBIN', strategy_id: 'FNO_STRADDLE', group_id: 'group-multi', leg_count: 2,
    fill_price: '36.00', quantity: '750',
  }));
  assert.equal(single.send, false);
  assert.equal(single.reason, 'SINGLE_LEG_OPEN_DUPLICATE');
  assert.equal(multi.send, true);
  assert.match(multi.whatsapp_message, /\*SBIN — PAPER OPENED\*/);
});

test('sends one analytical target but suppresses the execution-trigger precursor', () => {
  const target = run(cloudEvent('com.papertrading.target_track.closed.v1', {
    symbol: 'TITAN', side: 'BUY', strategy_id: 'OIIS_LIVE', entry_price: '3900',
    newly_closed_target_tracks: [
      { target_pct: '0.003', target_price: '3911.70', observed_price: '3914.20', hypothetical_after_tax_pnl: '215.30' },
    ], actual_execution_position_status: 'OPEN', mfe: '0.0041', mae: '-0.0011',
  }));
  const trigger = run(cloudEvent('com.papertrading.execution_target.hit.v1', {
    symbol: 'TITAN', execution_action: 'FULL_CLOSE', target_pct: '0.003',
  }));
  assert.equal(target.send, true);
  assert.match(target.whatsapp_message, /PAPER ANALYTICAL TARGET HIT/);
  assert.match(target.whatsapp_message, /Simulation only/);
  assert.equal(trigger.send, false);
});

test('notifies partial group close but avoids duplicate full leg close', () => {
  const partial = run(cloudEvent('com.papertrading.trade_group.partially_closed.v1', {
    symbol: 'SBIN', side: 'LONG', fill_price: '1088.40', closed_quantity: '250', remaining_quantity: '500',
  }));
  const leg = run(cloudEvent('com.papertrading.trade_leg.closed.v1', {
    symbol: 'SBIN', fill_price: '1092.00', closed_quantity: '750', remaining_quantity: '0',
  }));
  assert.match(partial.whatsapp_message, /PARTIAL CLOSE/);
  assert.equal(leg.send, false);
});

test('formats full group close with actual P&L components', () => {
  const result = run(cloudEvent('com.papertrading.trade_group.closed.v1', {
    symbol: 'LTM', side: 'BUY', strategy_id: 'OIIS_LIVE', quantity: '41',
    entry_price: '4839.60', exit_price: '4854.94', gross_realised_pnl: '628.80',
    trading_costs: '268.2331', income_tax_provision: '126.1984', net_after_tax: '234.3685',
    opened_at: '2026-08-11T04:00:00Z', closed_at: '2026-08-11T05:04:00Z',
    mfe: '0.0054', mae: '-0.0027', exit_reason_code: 'INTRADAY_0.003',
    strategy_version: '3.7', client_group_id: 'oiis-2026-08-11-ltm',
  }));
  assert.match(result.whatsapp_message, /\*LTM — CLOSED \| PROFIT\*/);
  assert.match(result.whatsapp_message, /\*Net result:\* \+₹234.37 \(\+0.12%\)/);
  assert.match(result.whatsapp_message, /BUY • 41/);
  assert.match(result.whatsapp_message, /\*Held:\* 1h 4m/);
  assert.match(result.whatsapp_message, /\*Reason:\* Intraday \+0.30% target filled/);
  assert.match(result.whatsapp_message, /Gross: \+₹628.80/);
  assert.match(result.whatsapp_message, /Best move: \+0.54% • Worst move: −0.27%/);
  assert.match(result.whatsapp_message, /Trade ref: 2026-08-11-ltm/);
  assert.match(result.whatsapp_message, /5-session and 30-session observation continues/);
});

test('formats short fills and closes using sell then buy direction', () => {
  const fill = run(cloudEvent('com.papertrading.trade_leg.opened.v1', {
    symbol: 'SBIN', side: 'SELL', strategy_id: 'OIIS_LIVE', fill_price: '1000',
    fill_quantity: '750', lot_size: '750',
  }));
  const close = run(cloudEvent('com.papertrading.trade_group.closed.v1', {
    symbol: 'SBIN', side: 'SELL', strategy_id: 'OIIS_LIVE', entry_price: '1000',
    exit_price: '990', quantity: '750', gross_realised_pnl: '7500', net_after_tax: '6000',
  }));
  assert.match(fill.whatsapp_message, /\*SBIN — SELL OPENED\*/);
  assert.match(fill.whatsapp_message, /Active exit target:\* ₹997.00 \(\+0.3%\)/);
  assert.match(close.whatsapp_message, /\*SBIN — CLOSED \| PROFIT\*/);
  assert.match(close.whatsapp_message, /Net result:\* \+₹6,000.00 \(\+0.8%\)/);
});

test('formats concise daily and weekly summaries', () => {
  const daily = run(cloudEvent('com.papertrading.summary.daily.v1', {
    summary: { requests_received: 2, groups_opened: 2, groups_closed: 1,
      net_realised_pnl: '234.37', open_data_incidents: 2 },
  }));
  const weekly = run(cloudEvent('com.papertrading.summary.weekly.v1', {
    summary: { requests_received: 8, groups_opened: 6, groups_closed: 5,
      net_realised_pnl: '1120.25', winning_trades: 3, losing_trades: 2 },
  }));
  assert.match(daily.whatsapp_message, /DAILY SUMMARY/);
  assert.match(daily.whatsapp_message, /Data warning: 2 unresolved/);
  assert.match(weekly.whatsapp_message, /WEEKLY SUMMARY/);
});

test('formats an explicit delivery test without presenting a trade', () => {
  const result = run(cloudEvent('com.papertrading.delivery.test.v1'));
  assert.equal(result.send, true);
  assert.match(result.whatsapp_message, /WHATSAPP DELIVERY TEST/);
  assert.match(result.whatsapp_message, /No paper trade was created or changed/);
});

test('rejects LIVE events even when delivery asks for WhatsApp', () => {
  const result = run(cloudEvent('com.papertrading.trade_intent.accepted.v1', {
    symbol: 'TITAN', delivery: { send_whatsapp: true },
  }, { environment: 'LIVE' }));
  assert.equal(result.send, false);
  assert.equal(result.reason, 'NON_PAPER');
});

let failed = 0;
for (const { name, body } of tests) {
  try {
    body();
    console.log(`PASS ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}`);
    console.error(error.stack || error);
  }
}
if (failed) process.exit(1);
console.log(`All ${tests.length} notification-policy tests passed.`);
