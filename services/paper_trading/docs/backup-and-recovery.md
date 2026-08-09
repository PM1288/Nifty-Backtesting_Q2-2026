# Backup and recovery

Back up `paper_trading` independently with `pg_dump -Fc -n paper_trading`. Retain the market-data source backup under the stack policy. After restore, run `papertrade reconcile`, compare ledger/group invariants, verify cursor watermarks, then start the monitor. Outbox rows are intentionally restored: delivered rows remain delivered and pending/retry rows resume at-least-once delivery with the same logical event ID.
