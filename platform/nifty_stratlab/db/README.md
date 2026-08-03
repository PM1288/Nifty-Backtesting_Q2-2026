# Database

`migrations/` contains the package-native migrations. The trading-stack
deployment copies are centrally owned under root `db/sql/014` through `019` and are
the only production migration path. Test them with
`scripts/nifty_stratlab_migrate_test.sh`; never point that script at `tradingdb`.

Package migration 006 mirrors root migration 019 and adds runtime idempotency plus
the V2 acceptance-evidence register.
