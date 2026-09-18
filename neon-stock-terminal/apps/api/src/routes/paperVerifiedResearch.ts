import type { Express } from "express";
import type { PrismaClient } from "@prisma/client";
import type { RequestAuthenticator } from "../auth/guard";
import { monthlyMembership, replayRecordedCapital, verifyTradeSessions, type Row } from "../lib/paperVerifiedReplay";

// Explicit research request only; never runs in a price/cursor callback.
const legsSql = `select l.trade_leg_id::text,l.trade_group_id::text,l.side,l.quantity_unit,
  l.opened_at,l.closed_at,l.total_units::text,l.remaining_quantity::text,
  l.average_entry_price::text,i.symbol,i.exchange,i.segment,i.instrument_token,
  g.strategy_id,g.strategy_version,p.last_mark::text as current_snapshot_mark,
  p.last_mark_at as current_snapshot_mark_at,p.realised_pnl::text as current_snapshot_realised_net,
  (select to_jsonb(ip)->>'sector' from public.instrument_profiles ip where ip.symbol=i.symbol limit 1) sector,
  coalesce((select jsonb_agg(jsonb_build_object('paper_order_id',o.paper_order_id,
    'accepted_at',o.accepted_at,'position_effect',o.position_effect,'current_status',o.status,
    'requested_quantity',o.requested_quantity::text,'filled_quantity_current',o.filled_quantity::text))
    from paper_trading.paper_orders o where o.trade_leg_id=l.trade_leg_id and o.accepted_at<=$1::timestamptz),'[]'::jsonb) orders,
  coalesce((select jsonb_agg(jsonb_build_object('paper_fill_id',f.paper_fill_id,
    'filled_at',f.filled_at,'quantity',f.quantity::text,'price',f.price::text,
    'position_effect',o.position_effect,'fill_model_version',f.fill_model_version,
    'spread_cost',f.spread_cost::text,'slippage_cost',f.slippage_cost::text) order by f.filled_at,f.paper_fill_id)
    from paper_trading.paper_fills f join paper_trading.paper_orders o using(paper_order_id)
    where f.trade_leg_id=l.trade_leg_id and f.filled_at<=$1::timestamptz),'[]'::jsonb) as fills,
  coalesce((select jsonb_agg(to_jsonb(h)) from paper_trading.horizon_outcomes h
    join paper_trading.observation_trackers ot using(observation_tracker_id)
    where ot.trade_leg_id=l.trade_leg_id),'[]'::jsonb) as horizons,
  coalesce((select jsonb_agg(jsonb_build_object('lifecycle',d.lifecycle,'target_pct',d.target_pct,
    'status',t.status,'first_hit_at',t.first_hit_at,'execution_action',d.execution_action))
    from paper_trading.target_tracks t join paper_trading.target_definitions d using(target_definition_id)
    where t.trade_leg_id=l.trade_leg_id),'[]'::jsonb) as targets,
  coalesce((select jsonb_agg(jsonb_build_object('at',e.effective_at,'kind',e.entry_kind,'amount',e.amount::text))
    from paper_trading.pnl_ledger e where e.trade_leg_id=l.trade_leg_id and e.effective_at<=$1::timestamptz),'[]'::jsonb) as accounting
 from paper_trading.trade_legs l join paper_trading.trade_groups g using(trade_group_id)
 join paper_trading.instrument_snapshots i using(instrument_snapshot_id)
 join paper_trading.positions p using(trade_leg_id)
 where g.strategy_id='OIIS_LIVE' and l.opened_at<=$1::timestamptz order by l.opened_at,l.trade_leg_id`;

const sessionsSql = `with legs as materialized (
 select l.trade_leg_id,l.opened_at,l.side,l.average_entry_price,i.exchange,i.instrument_token
 from paper_trading.trade_legs l join paper_trading.trade_groups g using(trade_group_id)
 join paper_trading.instrument_snapshots i using(instrument_snapshot_id)
 where g.strategy_id='OIIS_LIVE' and l.opened_at<=$1::timestamptz
), minutes as (
 select l.trade_leg_id,l.side,l.average_entry_price,b.ts,
 min(b.open) open,min(b.high) high,min(b.low) low,min(b.close) close,
 bool_and(b.open>0 and b.high>0 and b.low>0 and b.close>0 and
 b.low<=least(b.open,b.close) and b.high>=greatest(b.open,b.close) and
 b.open::text not in ('NaN','Infinity','-Infinity') and b.high::text not in ('NaN','Infinity','-Infinity') and
 b.low::text not in ('NaN','Infinity','-Infinity') and b.close::text not in ('NaN','Infinity','-Infinity'))
 and count(distinct (b.open,b.high,b.low,b.close))=1 as valid
 from legs l join public.bars_1m b on b.exchange=l.exchange and b.symbol_token=l.instrument_token
 and b.ts>=l.opened_at and b.ts<l.opened_at+interval '70 days' and b.ts<=$1::timestamptz-interval '1 minute'
 where (b.ts at time zone 'Asia/Kolkata')::time >= time '09:15'
 and (b.ts at time zone 'Asia/Kolkata')::time < time '15:30'
 and date_trunc('minute',b.ts)=b.ts
 group by l.trade_leg_id,l.side,l.average_entry_price,b.ts
), daily as (
 select trade_leg_id,(ts at time zone 'Asia/Kolkata')::date::text date,
 count(*) filter(where valid)::int valid_count,count(*) filter(where not valid)::int invalid_count,
 max(high) filter(where valid)::text high,min(low) filter(where valid)::text low,
 (array_agg(close order by ts desc) filter(where valid))[1]::text close,
 max(ts) filter(where valid) last_at
 from minutes group by trade_leg_id,(ts at time zone 'Asia/Kolkata')::date
), hits as materialized (
 select m.trade_leg_id,(m.ts at time zone 'Asia/Kolkata')::date::text date,v.target,min(m.ts) at
 from minutes m cross join (values(0.003),(0.004),(0.005),(0.01),(0.02),(0.03)) v(target)
 where m.valid and m.average_entry_price>0 and
 (case when m.side='SELL' then m.low<=m.average_entry_price*(1-v.target)
 else m.high>=m.average_entry_price*(1+v.target) end)
 group by m.trade_leg_id,(m.ts at time zone 'Asia/Kolkata')::date,v.target
), hitsets as (
 select trade_leg_id,date,jsonb_agg(jsonb_build_object('target',target,'at',at)) hits
 from hits group by trade_leg_id,date
)
 select d.*,coalesce(h.hits,'[]'::jsonb) hits from daily d left join hitsets h using(trade_leg_id,date)`;

export function buildVerifiedResearch(trades: Row[], candidates: Row[], asOf: string, feesBps = 0, slippageBps = 0, oneIssuer = false) {
  const source: Row[] = trades.map((trade) => ({ ...trade, verified: verifyTradeSessions(trade, asOf),
    monthly: monthlyMembership(trade, candidates), monthly_known: monthlyMembership(trade, candidates, true) }));
  const cohorts = [
    { id: "ALL_OIIS", label: "All OIIS trades", trades: source },
    { id: "MONTHLY_RETROSPECTIVE", label: "Monthly intersection · retrospective", trades: source.filter((trade) => trade.monthly.included) },
    { id: "MONTHLY_KNOWN", label: "Monthly qualification recorded before entry", trades: source.filter((trade) => trade.monthly_known.included) },
  ].map((cohort) => ({ ...cohort, trades: undefined, source_count: cohort.trades.length,
    scenarios: [100000, 200000].map((allocation) => replayRecordedCapital(cohort.trades, allocation, asOf, { feesBps, slippageBps, oneIssuer })),
    shadow_targets: (source[0]?.verified.opportunities ?? []).map((reference: Row) => {
      const shadows = cohort.trades.map((trade) => {
        const opportunity = trade.verified.opportunities.find((item: Row) => item.lifecycle === reference.lifecycle && item.target_pct === reference.target_pct);
        const at = opportunity?.status === "HIT" ? new Date(Date.parse(opportunity.hit_at) + 60000).toISOString() : null;
        const price = Number(trade.average_entry_price) * (1 + (trade.side === "SELL" ? -1 : 1) * reference.target_pct);
        return { ...trade, fills: [...trade.fills.filter((fill: Row) => fill.position_effect === "OPEN"),
          ...(at && Date.parse(at) <= Date.parse(asOf) ? [{ position_effect: "CLOSE", filled_at: at, price, quantity: trade.total_units, paper_fill_id: "ASSUMED_TARGET_TOUCH_NOT_RECORDED" }] : [])] };
      });
      return { lifecycle: reference.lifecycle, target_pct: reference.target_pct, basis: "INDEPENDENT_ASSUMED_TARGET_FILL_NOT_EXECUTABLE_PROFIT", scenarios: [100000, 200000].map((allocation) => ({ ...replayRecordedCapital(shadows, allocation, asOf, { feesBps, slippageBps, oneIssuer }), assumptions: { exits: "ASSUMED_FILL_AFTER_TOUCH_BAR_END", tick_rounding: "NOT_VERIFIED", spread_queue_fillability: "NOT_VERIFIED", no_stop_or_forced_exit: true, independent_scenario_not_additive: true } })) };
    }) }));
  const targetComparison = source[0]?.verified.opportunities.map((reference: Row) => {
    const rows = source.map((trade) => trade.verified.opportunities.find((item: Row) => item.lifecycle === reference.lifecycle && item.target_pct === reference.target_pct)!);
    return { lifecycle: reference.lifecycle, target_pct: reference.target_pct,
      hit: rows.filter((item) => item.status === "HIT").length, miss: rows.filter((item) => item.status === "MISS").length,
      censored: rows.filter((item) => item.status === "CENSORED").length, invalid: rows.filter((item) => item.status === "DATA_INVALID").length,
      disputed: rows.filter((item) => item.disagreement).length,
      average_minutes_to_hit: rows.filter((item) => item.status === "HIT").length ? rows.filter((item) => item.status === "HIT").reduce((sum, item) => sum + Number(item.minutes_to_hit), 0) / rows.filter((item) => item.status === "HIT").length : null };
  }) ?? [];
  const journeys = source.map((trade) => {
    const closeFills = trade.fills.filter((fill: Row) => fill.position_effect === "CLOSE");
    const touched = trade.verified.opportunities.filter((item: Row) => item.status === "HIT");
    const closeOrders = (trade.orders ?? []).filter((order: Row) => order.position_effect === "CLOSE");
    const remaining = Math.max(0, Number(trade.total_units) - closeFills.reduce((sum: number, fill: Row) => sum + Number(fill.quantity), 0));
    return { trade_leg_id: trade.trade_leg_id, trade_group_id: trade.trade_group_id, symbol: trade.symbol,
      touched_targets: touched.length, closing_fills: closeFills.length, remaining_as_of: remaining,
      state: remaining <= 1e-8 ? "CLOSED_BY_RECORDED_FILLS" : touched.length ? "TARGET_TOUCHED_BUT_CAPITAL_STILL_OPEN" : "OPEN_NO_VERIFIED_TARGET_TOUCH",
      capital_lock_reason: remaining <= 1e-8 ? "RELEASED_BY_RECORDED_FILLS" : closeFills.length ? "PARTIAL_EXIT" : closeOrders.length ? "NO_CLOSING_FILL_BY_CUTOFF" : "NO_RECORDED_CLOSE_ORDER_BY_CUTOFF",
      explanation: "A touch cannot prove an accepted, executable order or fill. Inspect the canonical order/event journey; no forced exit was added." };
  });
  return { version: "PAPER_VERIFIED_REPLAY_V1", as_of: asOf, generated_at: new Date().toISOString(), source, cohorts, target_comparison: targetComparison, journeys, monthly_candidates: candidates,
    parameters: { fees_bps: feesBps, slippage_bps: slippageBps, one_issuer: oneIssuer },
    limitations: ["Retained retrospective evidence, not a point-in-time forecast.", "Minute-start CASH bars: 09:15–15:29 IST, S0 inclusive; every expected minute is required for complete status.", "Unadjusted prices: corporate-action and executable-liquidity reconciliation remain required.", "Sampled daily/event drawdown is not maximum intraday drawdown.", "Historical candidate knowledge is certified only as stored-before-entry, not complete source availability.", "Cash shorts reserve entry notional; borrow/delivery feasibility is unverified.", "Spread/slippage stress is hypothetical, not recorded broker charges; model tax reserves are separate.", "Partial exits are scaled pro-rata and may be fractional; discrete lot execution is not simulated.", "Current snapshot marks, legacy horizons and current order statuses remain raw evidence only; they never control an earlier as-of replay.", "Each alternative target is an independent assumed-fill scenario; no executable profit or additive return is claimed.", "Calendar support is limited to verified 2026 normal cash sessions; special sessions and later years are unsupported."] };
}

export function registerPaperVerifiedResearch(app: Express, prisma: PrismaClient, auth: RequestAuthenticator) {
  let cache: { key: string; until: number; promise: Promise<Row> } | undefined;
  app.get("/v1/workspace/paper-trading/research", async (req, res, next) => {
    try {
      if (!await auth.getSession(req)) return void res.status(401).json({ error: "Authentication required" });
      const asOf = req.query.asOf == null ? new Date().toISOString() : String(req.query.asOf);
      if (!/^2026-\d{2}-\d{2}T/.test(asOf) || !Number.isFinite(Date.parse(asOf)) || Date.parse(asOf) > Date.now()) return void res.status(400).json({ error: "Valid non-future 2026 ISO asOf required" });
      const fees = Number(req.query.feesBps ?? 0), slip = Number(req.query.slippageBps ?? 0);
      if (![0, 5, 10, 20].includes(fees) || ![0, 5, 10, 20].includes(slip)) return void res.status(400).json({ error: "Stress basis points must be 0, 5, 10 or 20" });
      const oneIssuer = req.query.oneIssuer === "true";
      const key = JSON.stringify([req.query.asOf ?? "LIVE", fees, slip, oneIssuer]);
      if (cache && cache.key !== key && cache.until === Infinity) return void res.status(429).json({ error: "Another research replay is running; retry after it completes" });
      if (!cache || cache.key !== key || cache.until < Date.now()) {
        const promise = (async () => {
          // Serial queries protect the small paper pool and consolidate minute data server-side.
          const trades = await prisma.$queryRawUnsafe<Row[]>(legsSql, asOf);
          const sessions = await prisma.$transaction(async (tx) => {
            await tx.$executeRawUnsafe("SET LOCAL statement_timeout='45s'");
            return tx.$queryRawUnsafe<Row[]>(sessionsSql, asOf);
          }, { timeout: 50000 });
          const candidates = await prisma.$queryRawUnsafe<Row[]>(`select candidate_id::text,run_id::text,symbol,evaluation_month::text,signal_date::text,created_at,updated_at,conditions,source_provenance,data_quality from rolling_monthly.absolute_month_candidate where strategy_version='absolute_monthly_open_bullish_long_v3' and evaluation_month<=($1::timestamptz at time zone 'Asia/Kolkata')::date and evaluation_month>=coalesce((select date_trunc('month',min(opened_at) at time zone 'Asia/Kolkata')::date from paper_trading.trade_legs),'2026-01-01'::date)`, asOf);
          const byLeg = new Map<string, Row[]>();
          for (const session of sessions) { const rows = byLeg.get(session.trade_leg_id) ?? []; rows.push(session); byLeg.set(session.trade_leg_id, rows); }
          return buildVerifiedResearch(trades.map((trade) => ({ ...trade, sessions: byLeg.get(trade.trade_leg_id) ?? [] })), candidates, asOf, fees, slip, oneIssuer);
        })();
        cache = { key, until: Infinity, promise };
        promise.then(() => { if (cache?.promise === promise) cache.until = Date.now() + 60000; }, () => { if (cache?.promise === promise) cache = undefined; });
      }
      res.setHeader("Cache-Control", "private, no-store");
      res.json(await cache.promise);
    } catch (error) { next(error); }
  });
}
