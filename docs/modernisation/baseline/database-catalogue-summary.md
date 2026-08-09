# PostgreSQL catalogue summary

Captured: 2026-08-09 UTC

Source: read-only preservation manifest. Estimates are PostgreSQL catalogue
estimates, not exact counts unless the manifest's `exact_rows` is populated.

| Schema | Relations | Total bytes | Estimated rows |
|---|---:|---:|---:|
| research | 19 | 46,502,592,512 | 85,200,929 |
| public | 104 | 22,143,467,520 | 78,600,925 |
| oiis | 6 | 18,888,679,424 | 6,949,202 |
| migration_backup_20260808 | 7 | 7,769,423,872 | 24,570,520 |
| nse_app | 37 | 7,679,393,792 | 19,089,216 |
| nse | 19 | 7,046,373,376 | 8,478,813 |
| strategy_eval | 37 | 4,873,863,168 | 6,040,775 |
| oiis_research | 46 | 3,421,650,944 | 388,238 |
| nse_intraday | 21 | 639,549,440 | 1,183,208 |
| other schemas combined | 136 | under 300 MiB | catalogue estimates |

The database contains 424 user relations, 352 inheritance/partition entries and
43 sequences. Extensions are `plpgsql` and `pg_stat_statements`.

## Critical ranges

- `public.bars_1m`: 2026-05-11 01:25 UTC through 2026-08-08 01:25 UTC.
- published backtest run as-of dates: 2026-03-10 through 2026-08-06.
- OIIS live selection signal dates currently begin/end on 2026-08-07.
- paper event ledger currently spans 2026-08-09 06:43 UTC through 10:30 UTC.

## Audit implications

- `research.security_minute_technical` dominates storage and requires explicit
  retention/query ownership before any repartition recommendation.
- `migration_backup_20260808` is data-preservation material. Its name does not
  prove eligibility for deletion.
- `nse_app` contains both governed backtest publications and other dashboard
  read models; analytics-worker ownership remains authoritative.
- The interactive testing workspace must reuse the existing research and
  simulation contracts where possible rather than introduce an ungoverned
  second results database.
- A full logical backup and isolated restore is necessarily substantial; size
  is not grounds to skip proof.

The complete machine-readable evidence is
`data-preservation-manifest-pre.json` with its adjacent SHA-256 file.
