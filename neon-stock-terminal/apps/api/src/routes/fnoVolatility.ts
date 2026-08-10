import type { Express } from "express";
import type { PrismaClient } from "@prisma/client";

export function registerFnoVolatility(app: Express, prisma: PrismaClient) {
  app.get("/v1/fno-volatility/dashboard", async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const runs = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT * FROM fno_volatility.signal_run ORDER BY started_at DESC LIMIT 20`,
    );
    const liveRun = runs.find((row) => row.stage === "LIVE") ?? null;
    const premarketRun = runs.find((row) => row.stage === "PREMARKET") ?? null;
    const premarket = premarketRun
      ? await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT p.*,u.cash_symbol_token,u.nearest_future_expiry,u.nearest_option_expiry,
                  u.active_option_contracts,u.active_call_contracts,u.active_put_contracts,u.data_status universe_data_status
             FROM fno_volatility.movement_prediction p
             LEFT JOIN fno_volatility.universe_snapshot u ON u.run_id=p.run_id AND u.underlying=p.underlying
            WHERE p.run_id=$1::uuid ORDER BY p.movement_rank NULLS LAST,p.underlying`,
          premarketRun.run_id,
        )
      : [];
    const live = liveRun
      ? await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT p.*,s.signal_id,s.decision,s.confidence,s.reason_codes,
                  c.structure_type,c.expiry,c.call_symbol,c.put_symbol,c.call_strike,c.put_strike,
                  c.spot_price,c.futures_price,c.combined_entry_ask,c.combined_mark_bid,
                  c.combined_spread_pct,c.implied_move_pct,c.call_iv,c.put_iv,c.predicted_iv_change,
                  c.forecast_implied_ratio,c.expected_return_pct,c.probability_profit,c.pnl_p10,c.pnl_p50,
                  c.pnl_p90,c.expected_shortfall_95,c.quote_source_as_of,c.quote_age_seconds,c.data_status
             FROM fno_volatility.movement_prediction p
             LEFT JOIN fno_volatility.trade_signal s ON s.run_id=p.run_id AND s.underlying=p.underlying
             LEFT JOIN fno_volatility.option_candidate c ON c.candidate_id=s.candidate_id
            WHERE p.run_id=$1::uuid ORDER BY p.movement_rank NULLS LAST,p.underlying`,
          liveRun.run_id,
        )
      : [];
    const heartbeats = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT * FROM fno_volatility.service_heartbeat ORDER BY service_name`,
    );
    const universe = premarketRun
      ? await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT count(*)::int total,
                  count(*) FILTER (WHERE data_status='FULL')::int complete,
                  sum(active_option_contracts)::int option_contracts,
                  sum(active_call_contracts)::int call_contracts,
                  sum(active_put_contracts)::int put_contracts
             FROM fno_volatility.universe_snapshot WHERE run_id=$1::uuid`,
          premarketRun.run_id,
        )
      : [];
    res.json({
      environment: "PAPER",
      strategyId: "FNO_VOLATILITY_TWO_GATE",
      strategyVersion: "1.0.0",
      modelKind: "TRANSPARENT_PERCENTILE_MVP",
      premarketRun,
      liveRun,
      universe: universe[0] ?? null,
      premarket,
      live,
      heartbeats,
    });
  });
}
