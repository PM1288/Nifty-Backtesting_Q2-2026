BEGIN;

-- Preserve invalid pre-entry outcomes for audit while allowing the monitor to
-- replace them with correctly time-bounded results at the real horizon.
UPDATE __SCHEMA__.horizon_outcomes h
SET status='INVALIDATED_PRE_ENTRY',
    detail=coalesce(h.detail,'{}'::jsonb) || jsonb_build_object(
      'invalidated_reason','OUTCOME_COMPLETED_BEFORE_POSITION_OPEN',
      'invalidated_at',now(),
      'prior_completed_at',h.completed_at
    )
FROM __SCHEMA__.observation_trackers o
JOIN __SCHEMA__.trade_legs l USING(trade_leg_id)
JOIN __SCHEMA__.trade_groups g USING(trade_group_id)
WHERE h.observation_tracker_id=o.observation_tracker_id
  AND g.status IN ('OPEN','PARTIALLY_OPEN','PARTIALLY_CLOSED')
  AND h.completed_at < l.opened_at;

-- Reset only demonstrably time-corrupt open observations. Historical rows are
-- retained; the same durable tracker is re-evaluated from its actual fill.
UPDATE __SCHEMA__.observation_trackers o
SET status='ACTIVE',
    entry_session=(l.opened_at AT TIME ZONE 'Asia/Kolkata')::date,
    last_session_date=(l.opened_at AT TIME ZONE 'Asia/Kolkata')::date,
    sessions_observed=1,
    bars_observed=0,
    time_below_entry_minutes=0,
    highest_price=l.average_entry_price,
    lowest_price=l.average_entry_price,
    mfe=0,
    mae=0,
    peak_to_trough_drawdown=0,
    recovery_at=NULL,
    completed_at=NULL,
    censor_reason=NULL,
    version=o.version+1
FROM __SCHEMA__.trade_legs l
JOIN __SCHEMA__.trade_groups g USING(trade_group_id)
WHERE o.trade_leg_id=l.trade_leg_id
  AND g.status IN ('OPEN','PARTIALLY_OPEN','PARTIALLY_CLOSED')
  AND l.opened_at IS NOT NULL
  AND (
    o.last_session_date < (l.opened_at AT TIME ZONE 'Asia/Kolkata')::date
    OR o.completed_at < l.opened_at
    OR o.sessions_observed > greatest(1,current_date-(l.opened_at AT TIME ZONE 'Asia/Kolkata')::date+1)
  );

-- Re-evaluate unhit tracks for open positions using only post-entry bars.
UPDATE __SCHEMA__.target_tracks t
SET status='ACTIVE',first_hit_at=NULL,elapsed_bars=NULL,elapsed_minutes=NULL,
    mfe_before_target=NULL,mae_before_target=NULL,version=t.version+1
FROM __SCHEMA__.trade_legs l
JOIN __SCHEMA__.trade_groups g USING(trade_group_id)
WHERE t.trade_leg_id=l.trade_leg_id
  AND g.status IN ('OPEN','PARTIALLY_OPEN','PARTIALLY_CLOSED')
  AND NOT EXISTS (
    SELECT 1 FROM __SCHEMA__.target_hits h WHERE h.target_track_id=t.target_track_id
  );

-- Standard analytical ladders: intraday 0.3/0.5/1%, swing 1/3/5%.
UPDATE __SCHEMA__.target_definitions d
SET target_pct=0.010,target_code='INTRADAY_0.010'
FROM __SCHEMA__.trade_legs l
JOIN __SCHEMA__.trade_groups g USING(trade_group_id)
WHERE d.trade_group_id=g.trade_group_id
  AND l.trade_group_id=g.trade_group_id
  AND g.status IN ('OPEN','PARTIALLY_OPEN','PARTIALLY_CLOSED')
  AND d.lifecycle='INTRADAY' AND d.target_pct=0.007;

UPDATE __SCHEMA__.target_definitions d
SET target_pct=0.030,target_code='SWING_0.030'
FROM __SCHEMA__.trade_legs l
JOIN __SCHEMA__.trade_groups g USING(trade_group_id)
WHERE d.trade_group_id=g.trade_group_id
  AND l.trade_group_id=g.trade_group_id
  AND g.status IN ('OPEN','PARTIALLY_OPEN','PARTIALLY_CLOSED')
  AND d.lifecycle='SWING' AND d.target_pct=0.020;

UPDATE __SCHEMA__.target_tracks t
SET entry_price=l.average_entry_price,
    target_price=l.average_entry_price * (
      1 + CASE WHEN l.side='BUY' THEN d.target_pct ELSE -d.target_pct END
    ),
    activated_at=l.opened_at,
    version=t.version+1
FROM __SCHEMA__.target_definitions d
JOIN __SCHEMA__.trade_legs l ON l.trade_group_id=d.trade_group_id
JOIN __SCHEMA__.trade_groups g ON g.trade_group_id=l.trade_group_id
WHERE t.target_definition_id=d.target_definition_id
  AND t.trade_leg_id=l.trade_leg_id
  AND g.status IN ('OPEN','PARTIALLY_OPEN','PARTIALLY_CLOSED');

-- Force one position-aware replay from the fill timestamp without deleting the
-- immutable processed-bar rows. Revision V2 makes each source bar eligible once.
UPDATE __SCHEMA__.instrument_monitor_cursors c
SET last_bar_ts=x.opened_at-interval '1 microsecond',last_bar_id=NULL,updated_at=now()
FROM (
  SELECT i.exchange,i.instrument_token,min(l.opened_at) AS opened_at
  FROM __SCHEMA__.trade_legs l
  JOIN __SCHEMA__.trade_groups g USING(trade_group_id)
  JOIN __SCHEMA__.instrument_snapshots i USING(instrument_snapshot_id)
  WHERE g.status IN ('OPEN','PARTIALLY_OPEN','PARTIALLY_CLOSED')
    AND l.opened_at IS NOT NULL AND i.instrument_token IS NOT NULL
  GROUP BY i.exchange,i.instrument_token
) x
WHERE c.exchange=x.exchange AND c.instrument_token=x.instrument_token;

INSERT INTO __SCHEMA__.schema_migrations(version)
VALUES ('004_position_valuation_and_standard_ladders')
ON CONFLICT DO NOTHING;

COMMIT;
