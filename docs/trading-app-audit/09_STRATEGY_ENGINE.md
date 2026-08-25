# Strategy engine

> Evidence basis: static source inspection generated 2026-08-23T11:30:04.012Z. Runtime behaviour is labelled separately. “UNVERIFIED” means the source alone cannot establish the runtime condition.

The repository contains several independent strategy families rather than one engine: OIIS live selection, monthly/rolling variants, long options, NIFTY weekly options, F&O volatility signals, Go strategy commands, and backtesting-lab definitions. Their IDs must not be conflated merely because they share UI navigation.

| Candidate ID | First code evidence |
| --- | --- |
| backtest_options_alert_failed | [docs/trading-app-audit/evidence/strategy-map.json:3](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/docs/trading-app-audit/evidence/strategy-map.json#L3) |
| backtest_option_paper_trading_failed | [docs/trading-app-audit/evidence/strategy-map.json:8](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/docs/trading-app-audit/evidence/strategy-map.json#L8) |
| insert_strategy_run | [docs/trading-app-audit/evidence/strategy-map.json:13](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/docs/trading-app-audit/evidence/strategy-map.json#L13) |
| finish_strategy_run | [docs/trading-app-audit/evidence/strategy-map.json:18](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/docs/trading-app-audit/evidence/strategy-map.json#L18) |
| upsert_strategy_state | [docs/trading-app-audit/evidence/strategy-map.json:23](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/docs/trading-app-audit/evidence/strategy-map.json#L23) |
| insert_strategy_signals | [docs/trading-app-audit/evidence/strategy-map.json:28](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/docs/trading-app-audit/evidence/strategy-map.json#L28) |
| upsert_strategy_cooldowns | [docs/trading-app-audit/evidence/strategy-map.json:33](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/docs/trading-app-audit/evidence/strategy-map.json#L33) |
| strategy_options_mapping_failed | [docs/trading-app-audit/evidence/strategy-map.json:38](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/docs/trading-app-audit/evidence/strategy-map.json#L38) |
| daily_strategy_lab_v1 | [docs/trading-app-audit/evidence/strategy-map.json:43](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/docs/trading-app-audit/evidence/strategy-map.json#L43) |
| indicator_strategy_precompute | [docs/trading-app-audit/evidence/strategy-map.json:48](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/docs/trading-app-audit/evidence/strategy-map.json#L48) |
| rolling_monthly_bearish_short_quality_v2 | [docs/trading-app-audit/evidence/strategy-map.json:53](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/docs/trading-app-audit/evidence/strategy-map.json#L53) |
| absolute_monthly_first_session_gap_fill_long_v1 | [docs/trading-app-audit/evidence/strategy-map.json:58](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/docs/trading-app-audit/evidence/strategy-map.json#L58) |
| absolute_monthly_closure_bullish_long_v1 | [docs/trading-app-audit/evidence/strategy-map.json:63](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/docs/trading-app-audit/evidence/strategy-map.json#L63) |
| rolling_monthly_technical_quality_factor_v2 | [docs/trading-app-audit/evidence/strategy-map.json:68](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/docs/trading-app-audit/evidence/strategy-map.json#L68) |
| rolling_5_30_60_bullish_long_v1 | [docs/trading-app-audit/evidence/strategy-map.json:73](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/docs/trading-app-audit/evidence/strategy-map.json#L73) |
| analytics_options | [docs/trading-app-audit/evidence/strategy-map.json:78](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/docs/trading-app-audit/evidence/strategy-map.json#L78) |
| open_strategy_lab | [docs/trading-app-audit/evidence/strategy-map.json:83](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/docs/trading-app-audit/evidence/strategy-map.json#L83) |
| analytics_options_structure | [docs/trading-app-audit/evidence/strategy-map.json:88](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/docs/trading-app-audit/evidence/strategy-map.json#L88) |
| analytics_options_structure_help | [docs/trading-app-audit/evidence/strategy-map.json:93](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/docs/trading-app-audit/evidence/strategy-map.json#L93) |
| analytics_strategy_evaluation | [docs/trading-app-audit/evidence/strategy-map.json:98](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/docs/trading-app-audit/evidence/strategy-map.json#L98) |
| analytics_strategy_evaluation_help | [docs/trading-app-audit/evidence/strategy-map.json:103](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/docs/trading-app-audit/evidence/strategy-map.json#L103) |
| backtesting_strategy_detail | [docs/trading-app-audit/evidence/strategy-map.json:108](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/docs/trading-app-audit/evidence/strategy-map.json#L108) |
| backtesting_strategy_detail_section_view | [docs/trading-app-audit/evidence/strategy-map.json:113](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/docs/trading-app-audit/evidence/strategy-map.json#L113) |
| backtesting_strategy_detail_engagement | [docs/trading-app-audit/evidence/strategy-map.json:118](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/docs/trading-app-audit/evidence/strategy-map.json#L118) |
| format_options | [docs/trading-app-audit/evidence/strategy-map.json:123](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/docs/trading-app-audit/evidence/strategy-map.json#L123) |
| nifty_hybrid_technical_strategy_catalogue_v1 | [docs/trading-app-audit/evidence/strategy-map.json:128](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/docs/trading-app-audit/evidence/strategy-map.json#L128) |
| three_views_per_strategy | [docs/trading-app-audit/evidence/strategy-map.json:133](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/docs/trading-app-audit/evidence/strategy-map.json#L133) |
| trial_options | [docs/trading-app-audit/evidence/strategy-map.json:138](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/docs/trading-app-audit/evidence/strategy-map.json#L138) |
| macd_bearish_cross | [docs/trading-app-audit/evidence/strategy-map.json:143](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/docs/trading-app-audit/evidence/strategy-map.json#L143) |
| compare_strategy_count | [docs/trading-app-audit/evidence/strategy-map.json:148](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/docs/trading-app-audit/evidence/strategy-map.json#L148) |
| backtest_strategy_summary_mart | [docs/trading-app-audit/evidence/strategy-map.json:153](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/docs/trading-app-audit/evidence/strategy-map.json#L153) |
| backtesting_strategy_versions | [docs/trading-app-audit/evidence/strategy-map.json:158](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/docs/trading-app-audit/evidence/strategy-map.json#L158) |
| backtesting_compare_strategy_count | [docs/trading-app-audit/evidence/strategy-map.json:163](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/docs/trading-app-audit/evidence/strategy-map.json#L163) |
| backtesting_csv_strategy_count | [docs/trading-app-audit/evidence/strategy-map.json:168](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/docs/trading-app-audit/evidence/strategy-map.json#L168) |
| expected_strategy_count | [docs/trading-app-audit/evidence/strategy-map.json:173](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/docs/trading-app-audit/evidence/strategy-map.json#L173) |
| indicator_strategy_batch_run_id | [docs/trading-app-audit/evidence/strategy-map.json:178](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/docs/trading-app-audit/evidence/strategy-map.json#L178) |
| indicator_strategy_published_batch_run_id | [docs/trading-app-audit/evidence/strategy-map.json:183](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/docs/trading-app-audit/evidence/strategy-map.json#L183) |
| indicator_strategy_data_as_of_date | [docs/trading-app-audit/evidence/strategy-map.json:188](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/docs/trading-app-audit/evidence/strategy-map.json#L188) |
| indicator_strategy_registry_version | [docs/trading-app-audit/evidence/strategy-map.json:193](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/docs/trading-app-audit/evidence/strategy-map.json#L193) |
| implicit_optional | [docs/trading-app-audit/evidence/strategy-map.json:198](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/docs/trading-app-audit/evidence/strategy-map.json#L198) |
| strict_optional | [docs/trading-app-audit/evidence/strategy-map.json:203](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/docs/trading-app-audit/evidence/strategy-map.json#L203) |
| build_options | [docs/trading-app-audit/evidence/strategy-map.json:208](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/docs/trading-app-audit/evidence/strategy-map.json#L208) |
| global_options | [docs/trading-app-audit/evidence/strategy-map.json:213](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/docs/trading-app-audit/evidence/strategy-map.json#L213) |
| attribute_strategy_load_element | [docs/trading-app-audit/evidence/strategy-map.json:218](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/docs/trading-app-audit/evidence/strategy-map.json#L218) |
| token_strategy_load_element | [docs/trading-app-audit/evidence/strategy-map.json:223](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/docs/trading-app-audit/evidence/strategy-map.json#L223) |
| class_strategy_load_element | [docs/trading-app-audit/evidence/strategy-map.json:228](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/docs/trading-app-audit/evidence/strategy-map.json#L228) |
| rolling_candle_bullish_long_v1 | [docs/trading-app-audit/evidence/strategy-map.json:233](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/docs/trading-app-audit/evidence/strategy-map.json#L233) |
| rolling_candle_bearish_short_v1 | [docs/trading-app-audit/evidence/strategy-map.json:238](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/docs/trading-app-audit/evidence/strategy-map.json#L238) |
| rolling_monthly_bullish_long_quality_v2 | [docs/trading-app-audit/evidence/strategy-map.json:243](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/docs/trading-app-audit/evidence/strategy-map.json#L243) |
| base_strategy_id | [docs/trading-app-audit/evidence/strategy-map.json:248](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/docs/trading-app-audit/evidence/strategy-map.json#L248) |
| derived_strategy_id | [docs/trading-app-audit/evidence/strategy-map.json:253](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/docs/trading-app-audit/evidence/strategy-map.json#L253) |


The list is intentionally labelled “candidate IDs”: static string extraction also finds scenario and schema identifiers. Human classification is required before calling any identifier an executable strategy. Entry timing, bar-close knowledge, fill timing, costs, warm-up, and look-ahead protection must be verified in the linked implementation and tests.

## Add a new strategy in this repository

1. Define a stable ID/version and point-in-time input contract in the owning service.
2. Add entry/exit calculations and deterministic tests, including missing sessions and next-bar timing.
3. Add additive PostgreSQL migrations for durable inputs/results when required.
4. Register the service API in the Express gateway rather than exposing an internal container directly.
5. Add typed web response models and API client functions.
6. Register the route under Strategy without coupling it to OIIS or Paper Trading unless explicitly authorised.
7. Add Playwright and reconciliation fixtures.
8. Update OpenAPI and this audit evidence.
