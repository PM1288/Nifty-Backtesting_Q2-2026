# Database

`migrations/` contains the package-native migrations. The trading-stack
deployment copies are centrally owned under root `db/sql/014` through `019` and are
the only production migration path. Test them with
`scripts/nifty_stratlab_migrate_test.sh`; never point that script at `tradingdb`.

Package migration 006 mirrors root migration 019 and adds runtime idempotency plus
the V2 acceptance-evidence register.

The additive Rules-of-Engagement schema is centrally owned by root migration
`db/sql/020_strategy_evaluation_roe.sql`. It intentionally runs after the
analytics-worker migrations because its evidence rows reference canonical
`nse_app` backtest facts.
