-- Ensure the standard equity intraday ladder is monotonic and complete.
-- A +0.5% hit necessarily proves +0.4%; older OIIS intents omitted the
-- +0.4% definition while the dashboard correctly displayed the standard ladder.

BEGIN;

INSERT INTO __SCHEMA__.target_definitions(
  target_definition_id,trade_group_id,target_code,lifecycle,target_pct,execution_action
)
SELECT gen_random_uuid(),g.trade_group_id,'INTRADAY_0.004','INTRADAY',0.004,'TRACK_ONLY'
FROM __SCHEMA__.trade_groups g
WHERE g.asset_class='EQUITY'
ON CONFLICT(trade_group_id,target_code) DO UPDATE
SET target_pct=EXCLUDED.target_pct;

WITH missing AS (
  SELECT d.target_definition_id,l.trade_leg_id,l.side,l.opened_at,
         p.average_entry_price,o.mfe,
         ht.status AS higher_status,ht.first_hit_at AS higher_hit_at,
         CASE WHEN o.mfe>=0.004 THEN true ELSE false END AS mfe_proves_hit
  FROM __SCHEMA__.target_definitions d
  JOIN __SCHEMA__.trade_legs l ON l.trade_group_id=d.trade_group_id
  JOIN __SCHEMA__.trade_groups g ON g.trade_group_id=l.trade_group_id
  LEFT JOIN __SCHEMA__.positions p ON p.trade_leg_id=l.trade_leg_id
  LEFT JOIN __SCHEMA__.observation_trackers o ON o.trade_leg_id=l.trade_leg_id
  LEFT JOIN __SCHEMA__.target_definitions hd
    ON hd.trade_group_id=d.trade_group_id
   AND hd.lifecycle='INTRADAY' AND hd.target_pct=0.005
  LEFT JOIN __SCHEMA__.target_tracks ht
    ON ht.target_definition_id=hd.target_definition_id
   AND ht.trade_leg_id=l.trade_leg_id
  WHERE g.asset_class='EQUITY'
    AND d.lifecycle='INTRADAY' AND d.target_pct=0.004
    AND NOT EXISTS (
      SELECT 1 FROM __SCHEMA__.target_tracks existing
      WHERE existing.target_definition_id=d.target_definition_id
        AND existing.trade_leg_id=l.trade_leg_id
    )
)
INSERT INTO __SCHEMA__.target_tracks(
  target_definition_id,trade_leg_id,status,entry_price,target_price,
  activated_at,first_hit_at,result_kind
)
SELECT target_definition_id,trade_leg_id,
       CASE
         WHEN average_entry_price IS NULL OR opened_at IS NULL THEN 'PENDING_ENTRY'
         WHEN mfe_proves_hit
           OR higher_status IN ('HIT','CLOSED_AT_TARGET') THEN 'CLOSED_AT_TARGET'
         WHEN (opened_at AT TIME ZONE 'Asia/Kolkata')::date <
              (now() AT TIME ZONE 'Asia/Kolkata')::date THEN 'NOT_HIT_INTRADAY'
         WHEN (now() AT TIME ZONE 'Asia/Kolkata')::time >= time '16:00'
           THEN 'NOT_HIT_INTRADAY'
         ELSE 'ACTIVE'
       END,
       average_entry_price,
       CASE WHEN average_entry_price IS NULL THEN NULL
            WHEN side='SELL' THEN average_entry_price*(1-0.004)
            ELSE average_entry_price*(1+0.004) END,
       opened_at,
       higher_hit_at,
       CASE WHEN higher_status IN ('HIT','CLOSED_AT_TARGET') THEN 'INFERRED_MONOTONIC'
            WHEN mfe_proves_hit THEN 'INFERRED_FROM_MFE'
            ELSE 'HYPOTHETICAL' END
FROM missing
ON CONFLICT(target_definition_id,trade_leg_id) DO NOTHING;

-- Repair any existing lower target that was left open after a higher target hit.
WITH implied AS (
  SELECT lower_track.target_track_id,
         min(higher_track.first_hit_at) AS implied_hit_at
  FROM __SCHEMA__.target_tracks lower_track
  JOIN __SCHEMA__.target_definitions lower_def
    ON lower_def.target_definition_id=lower_track.target_definition_id
  JOIN __SCHEMA__.target_definitions higher_def
    ON higher_def.trade_group_id=lower_def.trade_group_id
   AND higher_def.lifecycle=lower_def.lifecycle
   AND higher_def.target_pct>lower_def.target_pct
  JOIN __SCHEMA__.target_tracks higher_track
    ON higher_track.target_definition_id=higher_def.target_definition_id
   AND higher_track.trade_leg_id=lower_track.trade_leg_id
  WHERE lower_def.lifecycle='INTRADAY'
    AND higher_track.status IN ('HIT','CLOSED_AT_TARGET')
    AND higher_track.first_hit_at IS NOT NULL
  GROUP BY lower_track.target_track_id
)
UPDATE __SCHEMA__.target_tracks t
SET status='CLOSED_AT_TARGET',
    first_hit_at=LEAST(COALESCE(t.first_hit_at,implied.implied_hit_at),implied.implied_hit_at),
    result_kind='INFERRED_MONOTONIC',
    version=t.version+1
FROM implied
WHERE t.target_track_id=implied.target_track_id
  AND (t.status NOT IN ('HIT','CLOSED_AT_TARGET') OR t.first_hit_at>implied.implied_hit_at);

INSERT INTO __SCHEMA__.schema_migrations(version)
VALUES ('012_intraday_040_monotonic_backfill')
ON CONFLICT DO NOTHING;

COMMIT;
