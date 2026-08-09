# Database schema

Migration `migrations/001_init.sql` creates the additive `paper_trading` schema and does not alter market sources. Core groups are identity/configuration, requests/idempotency, trading, analytical monitoring, append-only financial ledgers, events/outbox, and summaries/reconciliation.

Primary operator views: `v_open_trade_groups`, `v_open_trade_legs`, `v_trade_execution_performance`, `v_target_track_results`, `v_strategy_daily_performance`, `v_strategy_weekly_performance`, `v_account_equity_curve`, `v_webhook_delivery_health`, `v_data_freshness`, and `v_option_group_performance`.
