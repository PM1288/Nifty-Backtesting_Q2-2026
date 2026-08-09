# Database backup and restore proof

Date: 2026-08-09 UTC

## Result

**PASS.** The verified PostgreSQL 16 deployment was backed up outside the
repository and `tradingdb` was restored into a temporary PostgreSQL 16
container with networking disabled and no published ports.

## Backup identity

- External directory:
  `/home/novius2/backups/postgresql/trading-stack/20260809T144133Z`
- Primary archive: `tradingdb.dump`
- Archive size: 13,039,461,367 bytes
- Permissions: owner-only for dump and manifest material
- PostgreSQL restore version: 16.13
- Recovery files also include the globals dump, schema dumps, database
  catalogue, hashes and a timestamped manifest.

The initial wrapper finished all database dumps but stopped while enriching
the manifest. `scripts/db/finalize-partial-backup.sh` validated and finalised
the already-complete files; it did not repeat or replace the 13 GB dump.

## Restore proof

The restore test reports:

- isolated network: true;
- published ports: none;
- expected and restored database owner: `trader`;
- expected and restored restore-catalogue relations: 519/519;
- preservation comparison: PASS;
- missing relations/partitions: none;
- owner mismatches: none.

The deeper preservation comparison reconciled 424/424 source relations,
352/352 partitions, 17 critical exact counts, 43/43 sequences, 795 indexes,
784 constraints, 52 views, eight functions, two triggers, owners and
extensions.

Authoritative external evidence:

- `restore-proof-tradingdb.json`
- `restore-preservation-tradingdb.json`
- `restore-preservation-comparison-tradingdb.json`

## Safe repeat commands

```bash
cd /home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026
BACKUP_ROOT=/home/novius2/backups/postgresql/trading-stack \
  ./scripts/db/backup.sh
./scripts/db/verify-backup.sh \
  /home/novius2/backups/postgresql/trading-stack/20260809T144133Z
./scripts/db/restore-test.sh \
  /home/novius2/backups/postgresql/trading-stack/20260809T144133Z tradingdb
```

These scripts never remove a Docker volume or modify the source database.
Backups are deliberately excluded from Git.
