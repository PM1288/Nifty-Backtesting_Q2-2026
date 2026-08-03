-- Retention helper for reco/anomaly/ops/export tables

CREATE OR REPLACE FUNCTION nse_reco_ops.apply_retention(retention_days INTEGER)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  cutoff DATE := (CURRENT_DATE - retention_days);
BEGIN
  DELETE FROM nse_reco.recommendation_snapshot WHERE trade_date < cutoff;
  DELETE FROM nse_reco.market_regime_snapshot WHERE trade_date < cutoff;
  DELETE FROM nse_reco.watchlist_snapshot WHERE trade_date < cutoff;
  DELETE FROM nse_reco.anomaly_event WHERE trade_date < cutoff;

  DELETE FROM nse_reco_ops.quality_check_result WHERE trade_date < cutoff;
  DELETE FROM nse_reco_ops.job_run WHERE trade_date IS NOT NULL AND trade_date < cutoff;
  DELETE FROM nse_exports.export_manifest WHERE trade_date IS NOT NULL AND trade_date < cutoff;
END;
$$;
