# Paper Trading Evidence Workbench V2 migration and rollback

## Migration

- The existing `/n50/paper-trading` route and API contracts were preserved.
- V2 wraps the existing canonical analytical surfaces in a URL-addressable workbench; it does not create a parallel ledger.
- No database migration was required.
- No cache, collector, SmartAPI or broker-service change was required.
- Source was synchronised to `/home/novius2/trading-stack/neon-stock-terminal` and the existing `n50-dashboard` image was rebuilt under Compose project `trading-stack-novius2`.

## Rollback

Source backup:

`/home/novius2/trading-stack/backups/paper-workbench-v2-20260822T000000Z`

To roll back safely:

1. Stop only the `n50-dashboard` service in Compose project `trading-stack-novius2`.
2. Restore the backed-up dashboard source files to `/home/novius2/trading-stack/neon-stock-terminal`.
3. Rebuild and recreate only `n50-dashboard` with the same Compose project.
4. Verify container health, authenticated `/n50/paper-trading`, canonical list totals and browser console/API status.

No data rollback is needed because V2 made no schema change and did not mutate production trades. Do not roll back or delete PostgreSQL records, paper events, comments, quality reviews or audit entries.
