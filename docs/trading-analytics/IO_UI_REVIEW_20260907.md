# IO UI review and preservation map

Source folder is `/home/novius2/NIFTY50/IO for this` (not `/IO`). Reviewed both UI Markdown documents and rendered the HTML Morning/Scalper visual reference. Synthetic reference charts are not production inputs. Prior source audit, story and implementation constraints remain binding; original meeting DOCX is absent. Source screenshots were inspected in the earlier implementation review.

Baseline: pushed `ef05524`; route `/strategy/trading-analytics`; nine flat tabs, neutral cards/tables, three vertical scalper grids. Existing authenticated baseline screenshots: `output/playwright/trading-analytics-smartapi-20260907/` (four sizes). Shared shell/identity/authentication remain unchanged.

| Existing evidence | New location |
|---|---|
| Morning Brief, FII Activity, Participant OI | Morning View with three local tabs |
| Daily Price & EMA | Market Structure; daily retained, intraday and higher-timeframe read views |
| Exact-contract three panes | Scalper; underlying left, CE/PE right, ladder and explicit pin state |
| NSE chain and SmartAPI OI | OI & PCR with named provider subviews; never blend |
| Source, policy, reconciliation | Shared right evidence drawer; source values/JSON retained |
| As-of inspection | History coverage before controls; playback disabled without proven inputs |
| Missing stock turnover/delivery providers | Stock Activity explicit NIFTY not-applicable and canonical stock-research navigation |
| All existing CSV/JSON fields | Preserved independently of visual table columns |

Scope is UI plus additive read contracts. No formula thresholds, source priority, collector, authentication, strategy, order, ledger, or original data mutation. Existing query links remain accepted as aliases. ECharts is already installed (Apache-2.0); no new chart/dependency or third-party screenshot/logo runtime assets.

Known limitations must remain visible: unapproved level construction, unknown publication revisions, non-atomic quote windows, raw OI units, unavailable historical OI baselines and incomplete stock turnover/phase evidence. No invented rule confirmations or profit statistics.

## Implemented / validation checkpoint

Six primary workspaces, morning subviews, provider-separated OI subviews, shared native-dialog evidence drawers, source-row inspection, compact arithmetic colour tables, synchronized underlying/CE/PE panes, paired-strike ladder and URL-persisted pin selection. Four price timeframes use retained daily/minute data; weekly/monthly are additive read-only OHLC views and explicitly not session-reconciled. OI timelines use last recorded quote in each 15-minute bin, with raw values and both event/collection timestamps available.

Both application typechecks and builds pass. API: 162 tests passed, zero failures. Web: 72 tests passed, zero failures. Canonical repository preservation gate passes. Browser acceptance is a separate post-build step; do not interpret these checks as a complete backend or strategy release.

Browser regression command: run `node tools/playwright/trading-analytics-io-regression.mjs` from the repository with `PLAYWRIGHT_ADMIN_PASSWORD` supplied from the protected runtime environment (never written to a file). Optional `PLAYWRIGHT_BASE_URL` and `PLAYWRIGHT_OUTPUT_DIR`. Tests cover 1920, 1440, 1366, 1024 and 390 widths, six lenses, old query aliases, CSV row parity, drawer accessibility/focus, exact contracts, OI knowledge cutoffs and retained strike selection. Generated screenshots/data stay untracked in `output/playwright/trading-analytics-io-20260907/`.

Rollback uses the prior pushed application commit `2689f95` via a reviewed revert on master and dashboard-only rebuild. `TRADING_ANALYTICS_ENABLED=false` remains the existing module disable switch. No DB rollback is necessary; this change contains no migrations or writes.
