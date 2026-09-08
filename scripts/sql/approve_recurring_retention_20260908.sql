BEGIN;
SET LOCAL lock_timeout='2s';

INSERT INTO operations.retention_gate
 (relation_name,policy_version,retain_from,expires_at,daily_coverage_verified,
  paper_evidence_verified,dependencies_verified,restore_verified,backup_waived,
  backup_waiver_reason,rolling_cutoff,evidence_uri,approved_by)
SELECT relation_name,'RETENTION-20260907.1',now(),now()+interval '1 year',
       true,true,true,false,true,
       'User explicitly directed recurring cleanup without a new backup on 2026-09-08',
       true,'docs/operations/retention-review-20260907/CLEANUP_EXECUTION_20260908.md',
       'user-explicit-2026-09-08'
FROM unnest(ARRAY[
 'public.bars_1m','public.market_ticks','public.depth_5_metrics','public.depth_5_snapshots',
 'public.quote_snapshots','public.smartapi_option_chain_snapshots','public.option_greeks',
 'public.oi_snapshots_options','public.oi_snapshots_equity','public.oi_snapshots_futures',
 'public.oi_snapshots_index','public.pcr_snapshots','public.gainers_losers_snapshots',
 'public.oibuildup_snapshots','public.putcallratio_snapshots','public.symbol_perf_snapshot',
 'nse_intraday.raw_security_1m','nse_intraday.raw_index_1m',
 'nse_intraday.security_minute_feature','nse_intraday.market_minute_feature',
 'nse_intraday.stock_minute_volume_profile'
]) relation_name
ON CONFLICT(relation_name) DO UPDATE SET
 policy_version=excluded.policy_version,retain_from=excluded.retain_from,
 expires_at=excluded.expires_at,daily_coverage_verified=excluded.daily_coverage_verified,
 paper_evidence_verified=excluded.paper_evidence_verified,
 dependencies_verified=excluded.dependencies_verified,
 restore_verified=excluded.restore_verified,backup_waived=excluded.backup_waived,
 backup_waiver_reason=excluded.backup_waiver_reason,
 rolling_cutoff=excluded.rolling_cutoff,evidence_uri=excluded.evidence_uri,
 approved_by=excluded.approved_by,created_at=now();

COMMIT;
