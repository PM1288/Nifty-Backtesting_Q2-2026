BEGIN;

CREATE TABLE IF NOT EXISTS __SCHEMA__.evaluation_rule_sets (
  rule_set_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name text NOT NULL,
  version_no integer NOT NULL,
  status text NOT NULL CHECK (status IN ('DRAFT','ACTIVE','RETIRED')),
  intraday_targets numeric(18,10)[] NOT NULL,
  swing_targets numeric(18,10)[] NOT NULL,
  adverse_thresholds numeric(18,10)[] NOT NULL,
  short_horizon_sessions integer NOT NULL DEFAULT 5,
  long_horizon_sessions integer NOT NULL DEFAULT 30,
  grade_policy jsonb NOT NULL,
  calculation_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  UNIQUE(rule_name,version_no)
);

INSERT INTO __SCHEMA__.evaluation_rule_sets(
  rule_set_id,rule_name,version_no,status,intraday_targets,swing_targets,
  adverse_thresholds,grade_policy,calculation_version,activated_at
)
VALUES (
  '51b9d2e2-5e94-4da3-b4e0-460bf5872605',
  'NIFTY Paper Evaluation',2,'ACTIVE',
  ARRAY[0.003,0.004,0.005,0.010]::numeric[],
  ARRAY[0.010,0.030,0.050]::numeric[],
  ARRAY[-0.005,-0.010,-0.020,-0.050,-0.100]::numeric[],
  '{"excellent":{"mfe_gte":0.05,"mae_gt":-0.02},"good":{"mfe_gte":0.01,"mae_gt":-0.02},"bad_mae":-0.02}'::jsonb,
  'PAPER_EVALUATION_V2',now()
)
ON CONFLICT(rule_name,version_no) DO NOTHING;

ALTER TABLE __SCHEMA__.trade_groups
  ADD COLUMN IF NOT EXISTS evaluation_rule_set_id uuid REFERENCES __SCHEMA__.evaluation_rule_sets(rule_set_id);

UPDATE __SCHEMA__.trade_groups
SET evaluation_rule_set_id='51b9d2e2-5e94-4da3-b4e0-460bf5872605'
WHERE evaluation_rule_set_id IS NULL;

INSERT INTO __SCHEMA__.target_definitions(
  target_definition_id,trade_group_id,target_code,lifecycle,target_pct,execution_action
)
SELECT gen_random_uuid(),g.trade_group_id,'INTRADAY_0.004','INTRADAY',0.004,'TRACK_ONLY'
FROM __SCHEMA__.trade_groups g
WHERE g.asset_class='EQUITY'
  AND EXISTS (SELECT 1 FROM __SCHEMA__.trade_legs l WHERE l.trade_group_id=g.trade_group_id)
ON CONFLICT(trade_group_id,target_code) DO NOTHING;

INSERT INTO __SCHEMA__.target_tracks(
  target_definition_id,trade_leg_id,status,entry_price,target_price,activated_at
)
SELECT d.target_definition_id,l.trade_leg_id,
       CASE WHEN l.opened_at IS NULL THEN 'PENDING_ENTRY' ELSE 'ACTIVE' END,
       l.average_entry_price,
       CASE WHEN l.side='BUY' THEN l.average_entry_price*(1+d.target_pct)
            ELSE l.average_entry_price*(1-d.target_pct) END,
       l.opened_at
FROM __SCHEMA__.target_definitions d
JOIN __SCHEMA__.trade_legs l USING(trade_group_id)
WHERE d.target_code='INTRADAY_0.004'
  AND NOT EXISTS (
    SELECT 1 FROM __SCHEMA__.target_tracks t
    WHERE t.target_definition_id=d.target_definition_id AND t.trade_leg_id=l.trade_leg_id
  );

UPDATE __SCHEMA__.instrument_monitor_cursors c
SET last_bar_ts=replay.opened_at-interval '1 microsecond',last_bar_id=NULL,updated_at=now()
FROM (
  SELECT i.exchange,i.instrument_token,min(l.opened_at) AS opened_at
  FROM __SCHEMA__.trade_legs l
  JOIN __SCHEMA__.instrument_snapshots i USING(instrument_snapshot_id)
  JOIN __SCHEMA__.observation_trackers o USING(trade_leg_id)
  WHERE l.opened_at IS NOT NULL
    AND o.status IN ('ACTIVE','INTRADAY_COMPLETE','FIVE_SESSION_COMPLETE')
    AND i.instrument_token IS NOT NULL
  GROUP BY i.exchange,i.instrument_token
) replay
WHERE c.exchange=replay.exchange AND c.instrument_token=replay.instrument_token;

INSERT INTO __SCHEMA__.schema_migrations(version)
VALUES ('005_evaluation_rules_and_intraday_040')
ON CONFLICT DO NOTHING;

COMMIT;
