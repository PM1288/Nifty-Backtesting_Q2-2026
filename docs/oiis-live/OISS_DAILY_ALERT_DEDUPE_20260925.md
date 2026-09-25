# OISS daily research-alert deduplication — 2026-09-25

## Change

The consolidated OIIS/OISS research worker now admits at most one OISS source
candidate for each `(trade_date, normalized_symbol)`:

- OISS discovery selects the first completed selected scan for a symbol/day.
- Discovery excludes a symbol/day once an OISS source has been recorded.
- A repository-level guard drops duplicate OISS candidates even if a query
  later returns more than one.
- PostgreSQL enforces one OISS source row per daily evaluation with a partial
  unique index. The source insert uses conflict-safe insertion so concurrent
  discovery cannot turn the uniqueness guard into a worker failure.

The existing unique `(trade_date, symbol)` evaluation, unique consolidated
provider row, one-row delivery outbox and WhatsApp idempotency key are retained.
OIIS source lineage is not collapsed. This is a deduplication change only; it
does not change OISS selection rules, provider prompts, strategy calculations,
or paper/live order permissions.

## Validation and observed production state

- Production read-only audit on 2026-09-25 found no stock/day with multiple
  OISS source rows. The gate is preventative; it does not delete or rewrite
  historical records.
- For 2026-09-25, the audited daily consolidated provider rows had one attempt
  apiece and status `DEAD` with `HTTPStatusError`; this indicates the research
  endpoint was rejecting/failing requests at that time. It is separate from
  duplicate alert behavior. No conclusion about an OISS WhatsApp message was
  drawn from those OIIS-only records.
- Focused service tests, lint, container build and canonical source gate are
  recorded in `AGENT_HANDOFF.md` after release.

## Files

- `services/ai_stock_research/src/ai_stock_research/repository.py`
- `services/ai_stock_research/tests/test_daily_source_dedupe.py`
- `db/sql/061_ai_stock_research_oiss_daily_source_gate.sql`
- `scripts/deploy_ai_stock_research.sh`
- `services/ai_stock_research/README.md`
- `docs/uiux/FEATURE_PRESERVATION_MANIFEST_2026-08-25.md`

## Rollback

Revert the service source/deployment commit and rebuild the worker. The index is
additive; leaving it installed is safe and continues to protect the daily
deduplication invariant. Do not drop it as part of an application rollback.
