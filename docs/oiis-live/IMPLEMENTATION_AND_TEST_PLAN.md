# OIIS Live implementation and verification map

## Implemented boundaries

- Daily selector: `services/oiis_live/src/oiis_live/selector.py`.
- Policy and indicator semantics: `services/oiis_live/src/oiis_live/policy.py`.
- Scheduler, monitor, paper submission, error outbox: `main.py`.
- Runtime configuration: `services/oiis_live/config/policy.json`.
- Dedicated container: `compose/compose.oiis-live.yml`.
- Dynamic SmartAPI subscription merge: `cmd/collector/subscriptions.go` and
  `internal/store/postgres.go`.
- UI/API route: `/strategy/oiis-live` and `/v1/oiis-live/*`.
- Paper lifecycle separation: paper migration `002_target_lifecycle`.
- Historical evidence runner: `run_oiis_live_backtest.py`.

## Verification order

1. Apply migration 032 twice to a disposable database and verify idempotence.
2. Run policy boundary, hard-gate, strict RSI/WILLR and indicator unit tests.
3. Reproduce the supplied 3–6 August fixture exactly: 18 rows, with 1 HIGH,
   11 MEDIUM, 6 LOW; INTELLECT and OLAELEC are the two canonical rows.
4. Run one-stock and full 2023–2026 historical reviews.
5. Verify paper target regression: all diagnostic targets remain independent,
   I030 is D0 only, S100 starts D+1, and analytical outcomes do not close the
   execution position.
6. Run PostgreSQL paper integration tests and one/multi-worker idempotency tests.
7. Run collector Go tests and inspect subscription counts.
8. Build the API/web bundle and validate protected read and mutation routes.
9. Build/redeploy collector, paper services, OIIS Live, and N50 dashboard.
10. Check container health, application heartbeat age, data watermarks, entry
    reconciliation, paper outbox and error outbox.
11. Send a synthetic non-critical error through the durable OIIS error outbox
    and verify `DELIVERED`; do not fabricate a business trade.
12. Commit intentionally to `DEV_PM_CODE` and push the accepted repository.

## Promotion blockers

- Any mismatch in the 18-row reference regression.
- Any unresolved duplicate symbol/date entry.
- Any D0 swing target execution.
- Any target loop that stops after the first diagnostic hit.
- Any live/broker execution capability.
- Missing Postgres persistence for selection, claims, or errors.
- Stale source data represented as a current signal.
- Editable UI exposed without authentication.
