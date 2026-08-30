import type { Express } from "express";
import type { PrismaClient } from "@prisma/client";

type Row = Record<string, unknown>;

export type TrackedStockProvider = {
  provider: string;
  model: string;
  status: string;
  verdict: string | null;
  confidence: number | null;
  newsSignal: string | null;
  earningsState: string | null;
  webSentiment: string | null;
  summary: string | null;
  positiveEvidence: string | null;
  negativeEvidence: string | null;
  upcomingRisk: string | null;
  earningsView: string | null;
  marketView: string | null;
  priceNewsAlignment: string | null;
  technicalView: string | null;
  fundamentalView: string | null;
  keyDriver: string | null;
  keyRisk: string | null;
  entryView: string | null;
  invalidation: string | null;
  evidence: unknown[];
  completedAt: string | null;
  durationMs: number | null;
  errorClass: string | null;
  deliveryStatus: string | null;
};

const numericOrNull = (value: unknown): number | null => {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export function trackedStocksPayload(
  rows: Row[],
  requestedDate: string,
  effectiveDate: string | null,
) {
  return {
    asOf: new Date().toISOString(),
    requestedDate,
    effectiveDate,
    usedLatestSession: effectiveDate != null && effectiveDate !== requestedDate,
    count: rows.length,
    stocks: rows.map((row) => ({
      evaluationId: String(row.evaluation_id),
      tradeDate: String(row.trade_date),
      symbol: String(row.symbol),
      companyName: row.company_name == null ? null : String(row.company_name),
      exchange: String(row.exchange ?? "NSE"),
      direction: row.direction == null ? null : String(row.direction),
      strategyStatus: row.strategy_status == null ? null : String(row.strategy_status),
      ofactor: numericOrNull(row.ofactor),
      xfactor: numericOrNull(row.xfactor),
      referencePrice: numericOrNull(row.reference_price),
      sourceDataThrough: row.source_data_through == null ? null : String(row.source_data_through),
      historySessionCount: Number(row.history_session_count ?? 0),
      evaluationStatus: String(row.evaluation_status),
      discoveredAt: String(row.discovered_at),
      completedAt: row.completed_at == null ? null : String(row.completed_at),
      sources: Array.isArray(row.sources) ? row.sources : [],
      providers: row.providers && typeof row.providers === "object" ? row.providers : {},
      inputSnapshot: row.input_snapshot && typeof row.input_snapshot === "object"
        ? row.input_snapshot
        : {},
    })),
  };
}

export function registerAiTrackedStockRoutes(app: Express, prisma: PrismaClient) {
  app.get("/v1/workspace/paper-trading/tracked-stocks", async (req, res, next) => {
    try {
      const requested = typeof req.query.date === "string" ? req.query.date : "";
      const requestedDate = /^\d{4}-\d{2}-\d{2}$/.test(requested)
        ? requested
        : new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Kolkata",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(new Date());
      const dateRows = await prisma.$queryRawUnsafe<Row[]>(`
        select max(trade_date)::text as effective_date
        from ai_stock_research.evaluation
        where trade_date <= $1::date
      `, requestedDate);
      const effectiveDate = dateRows[0]?.effective_date == null
        ? null
        : String(dateRows[0].effective_date);
      const rows = effectiveDate == null ? [] : await prisma.$queryRawUnsafe<Row[]>(`
        select e.evaluation_id::text,e.trade_date::text,e.symbol,e.company_name,e.exchange,
               e.direction,e.strategy_status,e.ofactor::text,e.xfactor::text,e.reference_price::text,
               e.source_data_through::text,e.history_session_count,e.status as evaluation_status,
               e.discovered_at,e.completed_at,e.input_snapshot,
               coalesce((
                 select jsonb_agg(jsonb_build_object(
                   'strategy',s.source_strategy,'runId',s.source_run_id::text,
                   'candidateId',s.source_candidate_id::text,'slot',s.source_slot,
                   'trigger',s.trigger_kind,'observedAt',s.source_observed_at
                 ) order by s.source_observed_at,s.source_strategy)
                 from ai_stock_research.evaluation_source s where s.evaluation_id=e.evaluation_id
               ),'[]'::jsonb) as sources,
               coalesce((
                 select jsonb_object_agg(p.provider,jsonb_build_object(
                   'provider',p.provider,'model',p.model,'status',p.status,
                   'verdict',p.parsed_output->>'verdict',
                   'confidence',case
                     when (p.parsed_output->>'confidence') ~ '^[+-]?[0-9]+([.][0-9]+)?$'
                     then (p.parsed_output->>'confidence')::numeric
                     else null
                   end,
                   'newsSignal',p.parsed_output->>'news_signal',
                   'earningsState',p.parsed_output->>'earnings_state',
                   'webSentiment',p.parsed_output->>'web_sentiment',
                   'summary',p.parsed_output->>'summary',
                   'positiveEvidence',p.parsed_output->>'positive_evidence',
                   'negativeEvidence',p.parsed_output->>'negative_evidence',
                   'upcomingRisk',p.parsed_output->>'upcoming_risk',
                   'earningsView',p.parsed_output->>'earnings_view',
                   'marketView',p.parsed_output->>'market_view',
                   'priceNewsAlignment',p.parsed_output->>'price_news_alignment',
                   'technicalView',p.parsed_output->>'technical_view',
                   'fundamentalView',p.parsed_output->>'fundamental_view',
                   'keyDriver',p.parsed_output->>'key_driver',
                   'keyRisk',p.parsed_output->>'key_risk',
                   'entryView',p.parsed_output->>'entry_view',
                   'invalidation',p.parsed_output->>'invalidation',
                   'evidence',coalesce(p.parsed_output->'evidence','[]'::jsonb),
                   'completedAt',p.completed_at,'durationMs',p.duration_ms,
                   'errorClass',p.last_error_class,'deliveryStatus',d.status
                 ))
                 from ai_stock_research.provider_evaluation p
                 left join ai_stock_research.delivery_outbox d
                   on d.provider_evaluation_id=p.provider_evaluation_id
                 where p.evaluation_id=e.evaluation_id
               ),'{}'::jsonb) as providers
        from ai_stock_research.evaluation e
        where e.trade_date=$1::date
        order by e.discovered_at,e.symbol
      `, effectiveDate);
      res.setHeader("Cache-Control", "private, no-store");
      res.json(trackedStocksPayload(rows, requestedDate, effectiveDate));
    } catch (error) {
      next(error);
    }
  });
}
