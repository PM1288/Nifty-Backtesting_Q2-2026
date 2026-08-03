-- Views and helper functions

CREATE OR REPLACE FUNCTION nse_reco_ops.contract_check()
RETURNS TABLE(ok BOOLEAN, message TEXT, missing JSONB)
LANGUAGE plpgsql
AS $$
DECLARE
  missing_items JSONB := '[]'::jsonb;
  function_msg TEXT := 'ok';

  col_name TEXT;
BEGIN
  -- Required views
  FOR col_name IN
    SELECT format('%I.%I', v.schema_name, v.view_name)
    FROM (
      VALUES
        ('integration', 'v_security_minute_feature'),
        ('integration', 'v_market_minute_feature'),
        ('integration', 'v_universe_membership'),
        ('integration', 'v_index_daily_history')
    ) AS v(schema_name, view_name)
  LOOP
    IF to_regclass(col_name) IS NULL THEN
      missing_items := missing_items || jsonb_build_array(
        jsonb_build_object('view', col_name, 'column', NULL)
      );
    END IF;
  END LOOP;

  -- security minute feature required columns
  IF to_regclass('integration.v_security_minute_feature') IS NOT NULL THEN
    FOREACH col_name IN ARRAY ARRAY[
      'trade_date','ts','minute_of_day','symbol','sector_name','close','vwap','volume',
      'index_close','beta','residual_ret_5m_pct','residual_ret_15m_pct','residual_ret_30m_pct','residual_ret_60m_pct',
      'time_above_vwap_pct','vwap_deviation_pct','volume_surprise_z','range_efficiency','close_location'
    ]
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='integration' AND table_name='v_security_minute_feature' AND column_name=col_name
      ) THEN
        missing_items := missing_items || jsonb_build_array(
          jsonb_build_object('view', 'integration.v_security_minute_feature', 'column', col_name)
        );
      END IF;
    END LOOP;
  END IF;

  -- market minute feature required columns
  IF to_regclass('integration.v_market_minute_feature') IS NOT NULL THEN
    FOREACH col_name IN ARRAY ARRAY[
      'trade_date','ts','minute_of_day','index_code','index_close','index_ret_1m_pct',
      'breadth_up_pct','breadth_above_vwap_pct','dispersion_pctile','realized_vol_pctile'
    ]
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='integration' AND table_name='v_market_minute_feature' AND column_name=col_name
      ) THEN
        missing_items := missing_items || jsonb_build_array(
          jsonb_build_object('view', 'integration.v_market_minute_feature', 'column', col_name)
        );
      END IF;
    END LOOP;
  END IF;

  -- universe required columns
  IF to_regclass('integration.v_universe_membership') IS NOT NULL THEN
    FOREACH col_name IN ARRAY ARRAY['trade_date','symbol','is_active']
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='integration' AND table_name='v_universe_membership' AND column_name=col_name
      ) THEN
        missing_items := missing_items || jsonb_build_array(
          jsonb_build_object('view', 'integration.v_universe_membership', 'column', col_name)
        );
      END IF;
    END LOOP;
  END IF;

  -- index daily history required columns
  IF to_regclass('integration.v_index_daily_history') IS NOT NULL THEN
    FOREACH col_name IN ARRAY ARRAY['trade_date','index_code','close','high','low']
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='integration' AND table_name='v_index_daily_history' AND column_name=col_name
      ) THEN
        missing_items := missing_items || jsonb_build_array(
          jsonb_build_object('view', 'integration.v_index_daily_history', 'column', col_name)
        );
      END IF;
    END LOOP;
  END IF;

  IF jsonb_array_length(missing_items) > 0 THEN
    function_msg := 'missing required views/columns';
    RETURN QUERY SELECT FALSE, function_msg, missing_items;
  ELSE
    RETURN QUERY SELECT TRUE, function_msg, missing_items;
  END IF;
END;
$$;

-- Forward returns from minute data
CREATE OR REPLACE VIEW nse_reco.v_security_forward_returns AS
SELECT
  trade_date,
  symbol,
  ts,
  close,
  lead(close, 15) OVER (PARTITION BY trade_date, symbol ORDER BY ts) AS close_fwd_15m,
  lead(close, 30) OVER (PARTITION BY trade_date, symbol ORDER BY ts) AS close_fwd_30m,
  lead(close, 60) OVER (PARTITION BY trade_date, symbol ORDER BY ts) AS close_fwd_60m,
  last_value(close) OVER (
    PARTITION BY trade_date, symbol ORDER BY ts
    ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
  ) AS close_eod
FROM integration.v_security_minute_feature;

-- Recommendation outcomes (useful for scorecards)
CREATE OR REPLACE VIEW nse_reco.v_reco_outcomes AS
SELECT
  r.trade_date,
  r.index_code,
  r.horizon,
  r.symbol,
  r.asof_ts,
  r.signal_family,
  r.final_score,
  r.action,
  fr.close AS close_now,
  CASE WHEN fr.close_fwd_15m IS NOT NULL THEN 100.0 * (fr.close_fwd_15m / fr.close - 1.0) END AS ret_fwd_15m_pct,
  CASE WHEN fr.close_fwd_30m IS NOT NULL THEN 100.0 * (fr.close_fwd_30m / fr.close - 1.0) END AS ret_fwd_30m_pct,
  CASE WHEN fr.close_fwd_60m IS NOT NULL THEN 100.0 * (fr.close_fwd_60m / fr.close - 1.0) END AS ret_fwd_60m_pct,
  CASE WHEN fr.close_eod IS NOT NULL THEN 100.0 * (fr.close_eod / fr.close - 1.0) END AS ret_to_close_pct
FROM nse_reco.recommendation_snapshot r
JOIN nse_reco.v_security_forward_returns fr
  ON fr.trade_date = r.trade_date
  AND fr.symbol = r.symbol
  AND fr.ts = r.asof_ts;

-- Summary view for dashboard
CREATE OR REPLACE VIEW nse_reco.v_reco_summary AS
SELECT
  trade_date,
  index_code,
  horizon,
  COUNT(*) FILTER (WHERE action='buy_now') AS buy_now_count,
  COUNT(*) FILTER (WHERE action='wait_for_pullback') AS wait_pullback_count,
  COUNT(*) FILTER (WHERE action='watch_only') AS watch_only_count,
  COUNT(*) FILTER (WHERE action='avoid_despite_strength') AS avoid_count,
  COUNT(*) FILTER (WHERE action='anomaly_review_required') AS anomaly_review_count,
  MAX(asof_ts) AS asof_ts,
  avg(final_score) AS avg_score
FROM nse_reco.recommendation_snapshot
GROUP BY trade_date, index_code, horizon;
