BEGIN;
WITH active_groups AS (
  SELECT trade_group_id FROM __SCHEMA__.trade_groups
  WHERE status IN ('OPEN','PARTIALLY_OPEN','PARTIALLY_CLOSED','PENDING_ENTRY')
)
UPDATE __SCHEMA__.target_definitions d
SET execution_action = CASE
  WHEN d.lifecycle='INTRADAY' AND d.target_pct=0.010 THEN 'FULL_CLOSE'
  WHEN d.lifecycle='SWING' AND d.target_pct=0.030 THEN 'FULL_CLOSE'
  ELSE 'TRACK_ONLY'
END
FROM active_groups a
WHERE d.trade_group_id=a.trade_group_id
  AND ((d.lifecycle='INTRADAY' AND d.target_pct IN (0.003,0.010))
    OR (d.lifecycle='SWING' AND d.target_pct IN (0.010,0.030)));
WITH active_groups AS (
  SELECT trade_group_id FROM __SCHEMA__.trade_groups
  WHERE status IN ('OPEN','PARTIALLY_OPEN','PARTIALLY_CLOSED','PENDING_ENTRY')
)
UPDATE __SCHEMA__.execution_exit_rules r
SET client_rule_id = CASE WHEN r.target_lifecycle='INTRADAY' THEN 'I100' ELSE 'S300' END,
    value = CASE WHEN r.target_lifecycle='INTRADAY' THEN 0.010 ELSE 0.030 END
FROM active_groups a
WHERE r.trade_group_id=a.trade_group_id AND r.kind='TARGET_PCT'
  AND r.action='FULL_CLOSE' AND r.target_lifecycle IN ('INTRADAY','SWING');
COMMIT;
