# Known limitations

- True historical bid/ask and order-book depth are not present in `bars_1m`; spread/slippage therefore use configured estimates.
- Broker-specific brokerage must be reviewed when the tariff changes.
- Exchange holiday rows must be loaded from the governed calendar before production horizon scheduling; no weekday is treated as an authoritative expiry rule.
- Exact intrabar target/adverse sequence needs tick or lower-interval evidence.
- The n8n template contains routing placeholders; durable deduplication must be connected to n8n Data Store or PostgreSQL after import.
- The supplied production URL returned HTTP 404 on 2026-08-09 because n8n reported the `codex-paper-trade` workflow was not registered/active. Activate the imported workflow, then replay the retained dead letters.
- The 500-symbol performance benchmark and prospective workload soak remain to be run on production-like volume.
