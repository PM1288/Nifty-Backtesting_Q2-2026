BEGIN;

UPDATE oiis.replay_run
SET governance_json = governance_json || jsonb_build_object(
      'comparison_status', 'SUPERSEDED_EARLY_EXIT_TRUNCATED_LADDER',
      'compatibility', 'NOT_COMPARABLE_WITH_FULL_PATH_V2',
      'superseded_by_formula_version', 'OIIS-CASH-DAILY-RESEARCH-V1.3',
      'superseded_reason', 'V1.1 ladder evidence stopped at the selected execution exit and omitted later reward/adverse events.'
    )
WHERE formula_version = 'OIIS-CASH-DAILY-RESEARCH-V1.1';

UPDATE oiis.replay_run
SET governance_json = governance_json || jsonb_build_object(
      'comparison_status', 'SUPERSEDED_D5_EXECUTION_TRUNCATION',
      'path_evidence_compatibility', 'FULL_PATH_V2_VALID_WHERE_SUCCEEDED',
      'economics_compatibility', 'NOT_COMPARABLE_WITH_NO_TIMEOUT_EXECUTION',
      'superseded_by_formula_version', 'OIIS-CASH-DAILY-RESEARCH-V1.3',
      'superseded_reason', 'V1.2 froze D+5 labels correctly but incorrectly ended the separate execution scenario at D+5.'
    )
WHERE formula_version = 'OIIS-CASH-DAILY-RESEARCH-V1.2';

UPDATE oiis.replay_run
SET status = 'FAILED', finished_at = COALESCE(finished_at, NOW()),
    error_message = COALESCE(error_message, 'Abandoned historical process; superseded by full-path V1.3 replay.')
WHERE formula_version = 'OIIS-CASH-DAILY-RESEARCH-V1.1' AND status = 'RUNNING';

UPDATE oiis.replay_run
SET governance_json = governance_json || jsonb_build_object(
      'comparison_status', 'CANONICAL_FULL_PATH_V2',
      'evaluation_policy_id', 'FULL-PATH-LADDER-EVAL-I030-I050-I070-S100-S200-S500-A050-A100-A200-A500-A1000-A_GT1000-V2',
      'execution_scenario_id', 'EXEC-I030-ELSE-S100-NO-TIMEOUT-V2'
    )
WHERE formula_version = 'OIIS-CASH-DAILY-RESEARCH-V1.3' AND status = 'SUCCEEDED';

COMMIT;
