-- Finalise analytical target windows that pre-date the end-of-session finalizer.
-- Intraday targets expire after D0. Swing targets remain eligible through the
-- 30th observed trading session and expire only when that window matures.

BEGIN;

-- A higher target proves every lower target in the same lifecycle was crossed.
-- Legacy tracks added after the original bar are conservatively timestamped at
-- the higher target's first-hit time and explicitly marked as inferred.
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
  WHERE higher_track.status IN ('HIT','CLOSED_AT_TARGET')
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

UPDATE __SCHEMA__.target_tracks t
SET status='NOT_HIT_INTRADAY', version=t.version+1
FROM __SCHEMA__.target_definitions d,
     __SCHEMA__.observation_trackers o
WHERE t.target_definition_id=d.target_definition_id
  AND t.trade_leg_id=o.trade_leg_id
  AND t.status='ACTIVE'
  AND d.lifecycle='INTRADAY'
  AND o.entry_session IS NOT NULL
  AND (
    o.entry_session < (now() AT TIME ZONE 'Asia/Kolkata')::date
    OR (
      o.entry_session = (now() AT TIME ZONE 'Asia/Kolkata')::date
      AND (now() AT TIME ZONE 'Asia/Kolkata')::time >= time '16:00'
    )
  )
  AND o.bars_observed>0;

UPDATE __SCHEMA__.target_tracks t
SET status='TIMED_OUT', version=t.version+1
FROM __SCHEMA__.target_definitions d,
     __SCHEMA__.observation_trackers o
WHERE t.target_definition_id=d.target_definition_id
  AND t.trade_leg_id=o.trade_leg_id
  AND t.status='ACTIVE'
  AND d.lifecycle='SWING'
  AND o.sessions_observed>=30;

INSERT INTO __SCHEMA__.schema_migrations(version)
VALUES ('007_target_window_finalization')
ON CONFLICT DO NOTHING;

COMMIT;
