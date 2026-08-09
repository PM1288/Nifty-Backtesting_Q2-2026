# Database backup and restore runbook

These commands protect the verified `trading-stack-novius2` PostgreSQL 16
instance. They do not stop PostgreSQL and never remove the active volume.

## Backup

Choose a host directory outside the repository with restrictive access and
enough free space. The script refuses a repository-local target, discovers the
running container and active volume by Compose labels, dumps global roles and
every connectable non-template database, and writes an atomic manifest.

```bash
cd /home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026
BACKUP_ROOT=/home/novius2/backups/postgresql/trading-stack \
  ./scripts/db/backup.sh
```

The source database remains online. The backup may represent a transactionally
consistent point in each database, but the separate databases are not one
cross-database atomic snapshot.

Capture the pre-change preservation manifest separately. The explicit output
path prevents an earlier baseline being overwritten accidentally:

```bash
OUTPUT_FILE="$PWD/docs/modernisation/baseline/data-preservation-manifest-pre.json" \
  ./scripts/db/capture-preservation-manifest.sh
```

## Archive verification

```bash
BACKUP_DIR=/home/novius2/backups/postgresql/trading-stack/<backup-id> \
  ./scripts/db/verify-backup.sh
```

This verifies file sizes, SHA-256 hashes and every custom archive catalogue.
That is necessary but is not a substitute for restore proof.

## Isolated restore proof

```bash
BACKUP_DIR=/home/novius2/backups/postgresql/trading-stack/<backup-id> \
RESTORE_DATABASE=tradingdb RESTORE_JOBS=4 \
SOURCE_PRESERVATION_MANIFEST="$PWD/docs/modernisation/baseline/data-preservation-manifest-pre.json" \
  ./scripts/db/restore-test.sh
```

The restore-test script creates a uniquely named temporary PostgreSQL 16
container and volume with `--network none` and no published ports. On success it
removes only those exact temporary resources. On failure it retains them for
inspection and prints their names. It never connects to or modifies the source
database. It restores the global role catalogue first, restores object owners,
constraints and indexes, then captures a second preservation manifest inside
the restored database. The comparison fails if a pre-backup relation,
partition, exact critical row count, object owner or catalogue-object count is
missing. Source writes after the dump snapshot are intentionally not treated as
part of the archive.

Do not use `docker compose down -v`, `docker volume prune` or any broad Docker
cleanup command. The active source volume is
`trading-stack-novius2_pgdata` and must remain mounted to the running production
PostgreSQL container.
