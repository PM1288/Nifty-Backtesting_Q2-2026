BEGIN;

-- OISS scans can select the same symbol repeatedly during one trading day.
-- The evaluation identity is already (trade_date, symbol); this partial unique
-- index makes the OISS source side obey that same daily boundary even when
-- later scan runs produce new candidate IDs.
CREATE UNIQUE INDEX IF NOT EXISTS ai_stock_research_one_oiss_source_per_day
  ON ai_stock_research.evaluation_source(evaluation_id)
  WHERE source_strategy = 'OISS';

COMMIT;
