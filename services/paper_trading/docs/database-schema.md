# Database schema

## Data-quality incident history

Migration `003_data_quality_incident_history` preserves every stale/recovered incident while enforcing at most one `OPEN` stale incident for an exchange/instrument/type tuple. The former four-column uniqueness constraint incorrectly prevented a second historical recovery and could stop the monitor before pending fills were processed.

Migration `migrations/001_init.sql` creates the additive `paper_trading` schema and does not alter market sources. Core groups are identity/configuration, requests/idempotency, trading, analytical monitoring, append-only financial ledgers, events/outbox, and summaries/reconciliation.

Primary operator views: `v_open_trade_groups`, `v_open_trade_legs`, `v_trade_execution_performance`, `v_target_track_results`, `v_strategy_daily_performance`, `v_strategy_weekly_performance`, `v_account_equity_curve`, `v_webhook_delivery_health`, `v_data_freshness`, and `v_option_group_performance`.
# Trade-quality audit additions (V1.0.0, 2026-08-14)

- `trade_quality_policies`: immutable, effective-dated cash/options scoring policy snapshots.
- `trade_quality_assessments`: entry/current/final score checkpoints with coverage and hard-fail override.
- `trade_quality_criteria`: criterion-level 0–5 ratings, weighted points, evidence state and references.
- `v_trade_quality_latest`: latest durable assessment per trade group.

Policy V1.1.0 reconstructs cash-equity process ratings from the point-in-time OIIS candidate snapshot and uses ATR/account/fill evidence as explicit fallbacks. Open outcomes are durable `DEVELOPING` estimates; closed outcomes become full scores when their coverage gate passes. Multi-leg options remain assessed at trade-group level.

Migration `011_trade_quality_estimated_status` adds the durable `ESTIMATED` assessment state. It does not change historical V1.0.0 rows or trading/notification behavior.

## Trade-quality administrator reviews (V1.0.0, migration 010)

- `trade_quality_reviews`: append-only, administrator-authored factor ratings, hard-fail flags, entry-time evidence confirmation, note, reviewer and revision link.
- `v_trade_quality_review_latest`: latest review per trade group and policy version.
- Process ratings from a retrospective review are excluded unless `entry_evidence_confirmed=true`; outcome ratings may mature after entry.
- Unknown criterion and hard-fail IDs are rejected by the authenticated dashboard API before insert.
- Review creation is CSRF-protected and recorded in `request_audit`.
