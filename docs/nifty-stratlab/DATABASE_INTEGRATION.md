# PostgreSQL Integration

## Live estate discovered

- Container: `trading-stack-novius2-postgres-1`
- Database: `tradingdb`
- PostgreSQL: 16.13
- Application role observed: `trader`
- Existing schemas: `audit`, `institutional_flow`, `integration`, `market_data`,
  `nse`, `nse_app`, `nse_exports`, `nse_intraday`, `nse_ops`, `nse_reco`,
  `nse_reco_ops`, and `public`.

No connection string or password is stored in these docs.

Observed read-only coverage on 2026-08-02:

| Dataset | Rows | Coverage |
| --- | ---: | --- |
| `nse.fact_eod_prices` | 3,327,044 | 2021-03-08 to 2026-07-30 |
| `nse.fact_bhavcopy_udiff` | 1,848,025 | 2024-01-01 to 2026-07-30 |
| `public.bars_1m` | 23,660,682 | 2026-05-04 to 2026-08-01 |
| `nse_intraday.raw_security_1m` | 148,127 | 2026-07-28 to 2026-07-31 |
| `nse_intraday.raw_index_1m` | 4,488 | 2026-07-28 to 2026-07-31 |
| `public.option_chain_snapshots` | 4,164 | 2026-07-27 to 2026-08-02 |
| `public.option_greeks` | 19,537 | 2026-05-04 to 2026-07-28 |
| `public.pcr_snapshots` | 1,126,930 | 2026-05-04 to 2026-08-02 |

The Greeks feed lagged the continuing option-chain feed by several days, so options
research must expose a freshness failure rather than substitute stale Greeks.

## Universe coverage

`nse_intraday.universe_membership` contains 10,100 open-ended NIFTY100 rows for 100
distinct symbols (10,000 overlapping rows) and starts on 2026-01-09. The strict
adapter now fails closed. Diagnostic dedupe can return the latest 100 rows only when
`allow_snapshot_dedupe=True`; that is not historical membership evidence.

The operational snapshot adapter treats these rows according to their observed
storage semantics: it selects the latest complete `effective_from` snapshot on or
before the request date. It returns 100 members for 2026-01-09 and 2026-07-31 and
continues to fail closed before 2026-01-09. It never represents this as ten-year
historical membership.

## Mapping

| Need | Existing source | Canonical handling |
| --- | --- | --- |
| Minute/daily market data | `public.bars_1m`, `public.bars_1d`, `nse_intraday.raw_*` | Read-only adapters; preserve source/availability timestamps. |
| Historical universe | `nse_intraday.universe_membership` | `effective_from <= as_of` and open-ended/effective-to filtering. |
| Current live universe | `public.instrument_universe` | Live subscription input only; not historical membership evidence. |
| Existing backtest marts | `nse_app.backtest_*` | Continue serving published UI while canonical results are reconciled. |
| Option data | `public.option_chain_*`, `public.option_greeks`, bars/OI/PCR | Enforce freshness and active-contract time; premiums drive P&L. |
| New research state | `catalog`, `research`, `simulation` | Governed by root migrations 014–019. |

## Safety model

- Normal production inspection uses read-only SQL/transactions.
- Migrations are tested in `tradingdb_nifty_stratlab_test` by default.
- The test runner refuses protected names `tradingdb`, `marketdata`, and `postgres`.
- The workspace owner authorised deployment on 2026-08-02. Migrations 014–019 were
  backed up, applied to `tradingdb`, and reapplied successfully for idempotence.
- The published bounded run is `run_73281f76f5923e14d832ea232650e66a` under
  publication key `research:rsi_1m_daily45_v1:RELIANCE`.
- The pre-change production schema dump is stored under
  `/home/novius2/backups/nifty-backtesting/trading-stack-pre-five-phase-20260802T141051Z/postgres/`.
- The immediate production deployment backup is
  `/home/novius2/backups/nifty-backtesting/production-before-stratlab-20260802T153627Z/`.
