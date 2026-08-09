# Database location and volume map

Captured: 2026-08-09 UTC

- Container: `trading-stack-novius2-postgres-1`.
- Image: `postgres:16`.
- Server: PostgreSQL 16.13.
- Primary application database: `tradingdb`.
- Data directory in container: `/var/lib/postgresql/data`.
- Mount type: Docker named volume.
- Verified active volume: `trading-stack-novius2_pgdata`.
- Host mountpoint: `/var/lib/docker/volumes/trading-stack-novius2_pgdata/_data`.
- Volume creation: 2026-07-27.
- Primary database size at capture: 119,168,547,863 bytes (about 111 GiB).
- Host filesystem: about 1.8 TiB total, 357 GiB used and 1.3 TiB free.
- PostgreSQL host publication: port 5432 on IPv4 and IPv6 wildcard addresses.

Other named volumes `trading-stack_pgdata` and Redis/data volumes exist. Their
presence is not proof that they are disposable. Do not remove, rename or reuse
them until an isolated provenance/content audit is complete.

The active volume identity must be pinned in any future Compose redesign. No
new PostgreSQL volume was created and no seed or migration was run.
