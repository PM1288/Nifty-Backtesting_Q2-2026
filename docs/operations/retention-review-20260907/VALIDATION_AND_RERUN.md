# Evidence, safe reruns and limitations

## Locations

Repository: `/home/novius2/trading-stack`.

Generated read-only evidence: `output/retention-review-20260907/`:

- `catalog.json`: database/settings, physical and parent relations, columns, indexes, dependencies, bounded statistics and daily coverage.
- `relations.csv`, `indexes.csv`, `schema_totals.csv`, `foreign_keys.csv`, `view_dependencies.csv`.
- `estimates.json`, `retention_estimates.csv`: cutoffs and planner-only estimates, explicitly not exact purge counts.
- `duplicate_index_candidates.csv`: two review-only groups, not drop authorization.
- `runtime.json`: allowlisted runtime facts and sampled cleanup logs; no credential dump.
- `browser/route-inventory.json`, `browser/results.json`, screenshots: initial 65 route/viewport observations.
- `browser-recheck/`: partial extended rechecks, intentionally stopped, not a pass suite.

These runtime exports and screenshots are intentionally untracked. They remain on this host; use the Markdown report for durable Git handoff. Inspect access controls before sharing database catalogs externally.

## Rerun commands

```bash
cd /home/novius2/trading-stack
node --check scripts/audit/retention-review.mjs
node --check tools/playwright/retention-route-review.mjs
bash scripts/verify/canonical-repository-gate.sh

# Catalog/EXPLAIN WITHOUT ANALYZE only. Use a new output directory.
# Run off-hours; read-only queries still consume resources.
AUDIT_OUTPUT=output/retention-review-followup node scripts/audit/retention-review.mjs
```

The catalog tool sets transaction read-only, 20-second statement timeout and 1.5-second lock timeout. It does not execute DELETE, VACUUM, ANALYZE or DDL. Planner estimates apply to selected large time-series relations, not every table. The existing application cleanup `--dry-run` is **not** safe for a strictly non-mutating audit because it can create partitions.

Do not repeat the broad browser harness against production until timeout/restart issues are resolved. Stage it against an isolated restored service, inject protected `PLAYWRIGHT_ADMIN_PASSWORD` through the existing secret mechanism, and review `tools/playwright/retention-route-review.mjs` before execution. The harness blocks browser mutation methods after login; GET endpoints can still consume compute and produce ordinary server access logs. Its short observation window is a smoke check only.

## Source review pointers

- `internal/store/cleanup.go`: retention coverage, partition boundaries, dry-run behavior, byte caps and timezone cutoff.
- `cmd/collector/retention.go`: job scheduling and terminal logs.
- `scripts/db_cleanup.sh`: existing operator entrypoint; inspect compose project/config before future use.
- `scripts/migrate_timeseries_monthly_partitions.sql`: migration recovery-copy lineage.
- `services/nse_intraday_intelligence/`: duplicate cleanup definition, independent TTLs, compatibility views and historical statistics consumers.
- `neon-stock-terminal/apps/web/src/App.tsx`: canonical route inventory.
- `docs/trading-analytics/CASH_OI_AXIS_20260907.md`: current cash/Greek source limitations.

## Acceptance status

Completed: read-only size/dependency/runtime inspection; planner-based expiry estimates; retention code review; initial route smoke capture; documented stop on service degradation; recovery observed healthy.

Not completed or claimed: actual deletion/reclaim, restore test, per-stock daily anti-join/parity for every proposed deletion, external-consumer certification, full numerical/export/chart regression, controlled concurrency benchmark, root-cause proof of process restart, production fixes or deployment.

Validation of delivered audit tooling: both Node syntax checks passed (2/2); canonical repository gate passed (1/1). No application unit suite or build was rerun: runtime application files are unchanged. The browser harness now requires an explicit base URL and stops on a server 5xx; production targeting has an additional explicit opt-in. These safety edits were syntax-checked, not rerun against production.

No WhatsApp messages, broker orders or cleanup jobs were submitted by this audit. Backup/archive retention decisions and exact approved deletion manifests require the next implementation phase.
