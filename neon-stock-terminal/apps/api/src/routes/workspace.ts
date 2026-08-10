import type { Express } from "express";
import type { PrismaClient } from "@prisma/client";
import type { RequestAuthenticator } from "../auth/guard";

type Row = Record<string, unknown>;

export function registerWorkspaceRoutes(app: Express, prisma: PrismaClient, auth: RequestAuthenticator) {
  app.get("/v1/workspace/paper-trading", async (_req, res, next) => {
    try {
      const [summary, statuses, recent, targetStatuses, incidents] = await Promise.all([
        prisma.$queryRawUnsafe<Row[]>(`
          select
            (select count(*)::int from paper_trading.trade_groups) as total_groups,
            (select count(*)::int from paper_trading.trade_groups where status in ('OPEN','PARTIALLY_OPEN','PARTIALLY_CLOSED','PENDING_ENTRY')) as active_groups,
            (select count(*)::int from paper_trading.trade_groups where status='CLOSED') as closed_groups,
            (select count(*)::int from paper_trading.trade_groups where status='PENDING_ENTRY') as pending_entry_groups,
            (select count(*)::int from paper_trading.positions where remaining_quantity > 0) as open_positions,
            (select coalesce(sum(realised_pnl),0)::text from paper_trading.positions) as realised_pnl,
            (select coalesce(sum(unrealised_pnl),0)::text from paper_trading.positions) as unrealised_pnl,
            (select max(last_mark_at) from paper_trading.positions) as latest_mark_at,
            (select count(*)::int from paper_trading.webhook_outbox where status not in ('DELIVERED','CANCELLED')) as pending_webhooks,
            (select max(delivered_at) from paper_trading.webhook_outbox where status='DELIVERED') as latest_webhook_delivery,
            (select count(*)::int from paper_trading.target_tracks where status in ('ACTIVE','PENDING_ENTRY')) as active_target_tracks,
            (select count(*)::int from paper_trading.target_tracks where status in ('HIT','CLOSED_AT_TARGET')) as completed_target_tracks,
            (select count(*)::int from paper_trading.data_quality_incidents where status not in ('RECOVERED','RESOLVED','CLOSED')) as open_data_incidents
        `),
        prisma.$queryRawUnsafe<Row[]>(`
          select status, count(*)::int as count
          from paper_trading.trade_groups group by status order by count(*) desc, status
        `),
        prisma.$queryRawUnsafe<Row[]>(`
          select g.trade_group_id::text,g.strategy_id,g.strategy_version,g.asset_class,g.status,g.fully_closed,
                 g.opened_at,g.closed_at,g.created_at,count(distinct l.trade_leg_id)::int as leg_count,
                 coalesce(sum(l.remaining_quantity),0)::text as remaining_units,
                 coalesce(sum(p.realised_pnl),0)::text as realised_pnl,
                 coalesce(sum(p.unrealised_pnl),0)::text as unrealised_pnl,max(p.last_mark_at) as last_mark_at
          from paper_trading.trade_groups g
          left join paper_trading.trade_legs l on l.trade_group_id=g.trade_group_id
          left join paper_trading.positions p on p.trade_leg_id=l.trade_leg_id
          group by g.trade_group_id order by g.created_at desc limit 20
        `),
        prisma.$queryRawUnsafe<Row[]>(`
          select status,count(*)::int as count
          from paper_trading.target_tracks group by status order by count(*) desc,status
        `),
        prisma.$queryRawUnsafe<Row[]>(`
          select incident_type,status,count(*)::int as count,max(detected_at) as latest_detected_at
          from paper_trading.data_quality_incidents
          group by incident_type,status order by latest_detected_at desc limit 20
        `)
      ]);
      res.json({ asOf: new Date().toISOString(), environment: "PAPER", summary: summary[0] ?? {}, statuses, recent, targetStatuses, incidents });
    } catch (error) { next(error); }
  });

  app.get("/v1/workspace/nifty-500", async (_req, res, next) => {
    try {
      const [latest, history] = await Promise.all([
        prisma.$queryRawUnsafe<Row[]>(`
          select * from nse_app.market_summary_daily order by trade_date desc limit 1
        `),
        prisma.$queryRawUnsafe<Row[]>(`
          select trade_date, securities_count, advancers, decliners, unchanged, positive_ratio::text,
                 nifty_close::text, nifty_return::text, market_regime
          from nse_app.market_summary_daily order by trade_date desc limit 30
        `)
      ]);
      res.json({ asOf: new Date().toISOString(), latest: latest[0] ?? null, history });
    } catch (error) { next(error); }
  });

  app.get("/v1/workspace/futures", async (_req, res, next) => {
    try {
      const rows = await prisma.$queryRawUnsafe<Row[]>(`
        select market_date, client_type, instrument_type, buy_contracts::text, sell_contracts::text,
               open_interest_long::text, open_interest_short::text,
               call_long::text, call_short::text, put_long::text, put_short::text
        from institutional_flow.normalized_nse_derivatives_participants
        order by market_date desc, client_type, instrument_type limit 120
      `);
      res.json({ asOf: new Date().toISOString(), rows });
    } catch (error) { next(error); }
  });

  app.get("/v1/workspace/control-plane", async (req, res, next) => {
    const session = await auth.getSession(req);
    if (!session || session.user.role !== "admin" || !session.user.uid.startsWith("local-admin:")) {
      return res.status(403).json({ error: { code: "ADMIN_REQUIRED", message: "Administrator access required." } });
    }
    try {
      const [database, tables, activity] = await Promise.all([
        prisma.$queryRawUnsafe<Row[]>(`
          select current_database() as database_name,
                 pg_size_pretty(pg_database_size(current_database())) as database_size,
                 now() as checked_at
        `),
        prisma.$queryRawUnsafe<Row[]>(`
          select schemaname, count(*)::int as table_count,
                 pg_size_pretty(sum(pg_total_relation_size(format('%I.%I', schemaname, tablename)::regclass))) as total_size
          from pg_tables where schemaname in ('nse','nse_app','nse_intraday','market_data','paper_trading','institutional_flow')
          group by schemaname order by schemaname
        `),
        prisma.$queryRawUnsafe<Row[]>(`
          select count(*)::int as connections,
                 count(*) filter (where state = 'active')::int as active_connections
          from pg_stat_activity where datname = current_database()
        `)
      ]);
      res.json({ asOf: new Date().toISOString(), database: database[0] ?? {}, activity: activity[0] ?? {}, schemas: tables });
    } catch (error) { next(error); }
  });
}
