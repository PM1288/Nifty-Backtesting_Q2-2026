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

Follow-up browser review identified and corrected the Morning heading hierarchy, nested complementary landmark, keyboard focus in raw JSON scroll areas and clipped ladder layout. OI lines now break across missing bins/closed-session gaps rather than imply an interpolated observation. Two additional OI presentation tests bring web coverage to 74 tests. The Stock Activity link reuses `/analytics/leadership`; no placeholder `/stocks` route is introduced. Selecting contract source evidence can open its pinned pair in Scalper with the same expiry.

### Material remaining gaps

- BANKNIFTY PCR/expiry and cash publication timing are not supplied by this endpoint; missing values stay explicit.
- No approved/materialized price-aligned OI profile or daily/weekly structural level provider; no unsupported chart overlays.
- The three chart panes show measured OHLC/own-series EMA and full raw evidence, but policy approval and a fully materialized condition-event provider remain incomplete. No confirmed recommendation or paper eligibility is claimed.
- Stock turnover/delivery baseline provider and immutable original/revised playback are not connected; those panes explain the limitation and preserve existing stock research access.
- Multi-period OHLC is a retained-source presentation view, not an exchange-session coverage certification. Historical contract master knowledge can exclude contracts. Raw OI unit verification remains separate.
- Source reference mockups are design references only. No synthetic reference price, turnover, OI or performance data was imported.

Browser regression command: run `node tools/playwright/trading-analytics-io-regression.mjs` from the repository with `PLAYWRIGHT_ADMIN_PASSWORD` supplied from the protected runtime environment (never written to a file). Optional `PLAYWRIGHT_BASE_URL` and `PLAYWRIGHT_OUTPUT_DIR`. Tests cover 1920, 1440, 1366, 1024 and 390 widths, six lenses, old query aliases, CSV row parity, drawer accessibility/focus, exact contracts, OI knowledge cutoffs and retained strike selection. Generated screenshots/data stay untracked in `output/playwright/trading-analytics-io-20260907/`.

Rollback uses the prior pushed application commit `2689f95` via a reviewed revert on master and dashboard-only rebuild. `TRADING_ANALYTICS_ENABLED=false` remains the existing module disable switch. No DB rollback is necessary; this change contains no migrations or writes.

## Final deployment and acceptance — 2026-09-07

- Deployed application commit: `1d85eae`, pushed on `ui/trading-analytics-io-20260907` and fast-forwarded/pushed to canonical `master` before image build. Earlier implementation commits: `0a69930`, `624de39`.
- Running dashboard image: `sha256:7d4a027b13f4742b82dc5619731e61a66a74b2b2877099472b64ffdf019cc2b0`.
- Live route: `https://n50.nifty50today.co.in/n50/strategy/trading-analytics`.
- Both typechecks/builds pass; API **162/162**, web **74/74**, canonical preservation gate passes. No failed or skipped unit tests.
- Authenticated public-route regression: **215/215** assertions at 1920×1080, 1440×900, 1366×768, 1024×768 and 390×844. All six views, three drawers, old query aliases, CSV row parity, pin persistence, known-at OI data and safety flags passed. Axe found zero violations in the tested main workspaces and dialogs; no uncaught JavaScript errors or page-level horizontal overflow.
- Additional deployed-gateway interaction test: **6/6**, including actual 5m/60m requests, complete bars versus calendar-derived duration and chart unmount on collapse. Default 15m is covered by the full regression. Test script: `tools/playwright/trading-analytics-io-timeframes.mjs` (same protected password environment; accepts `PLAYWRIGHT_BASE_URL`). Its final run used `http://127.0.0.1:19090/n50`, the same deployed dashboard. Initial public-network retry and an overly exact test label were corrected; those failed attempts are not counted as successful runs.
- Original daily chart zoom/legend interactions are retained in the new price panes; EMA visibility remains separately controllable.
- **46 screenshots**, source CSVs, complete run/chart JSON and machine-readable results: `/home/novius2/trading-stack/output/playwright/trading-analytics-io-20260907/`. Main results `results.json`; supplemental `timeframe-results.json`; `*-axe.json`; representative `1920-morning.png`, `1920-scalper.png`, `1440-structure.png`, `390-morning.png`, `timeframe-controls.png`. These generated artifacts are not committed.

### Real data verified

September 7 report: 16 activity rows, five participant rows, 400 daily bars, 85 weekly and 21 monthly read-view bars. Twenty SmartAPI option legs all contain current OI. The verified pair was `NIFTY08SEP2623800CE` / `NIFTY08SEP2623800PE`; each has 120 retained OI timeline observations. Underlying / CE / PE source-minute counts were 3,020 / 1,433 / 1,435. Missing minutes remain missing, and only complete closed bars are plotted as such. Zero source-query errors; reconciliation/policy issues remain visible. No paper or real order was enabled or sent.

### Performance evidence, not an optimization claim

Final authenticated first-useful-evidence times were 1,366 / 1,261 / 1,348 / 1,363 / 894 ms across the five widths above. Earlier four-width baseline was 1,035 / 621 / 620 / 862 ms. These are single network-inclusive observations with changed read payloads, not controlled benchmarks; no speed-up claim is made. Per-view timings include screenshot and axe work and are explicitly labelled that way. FPS, React commit counts and synchronized-cursor latency have not been benchmarked. Inactive main lenses have no mounted charts; collapsed higher-period charts are explicitly tested to unmount.

### Rerun / rollout

From `/home/novius2/trading-stack`, run the mandatory checks listed in `AGENTS.md`, then the two Playwright scripts using protected runtime credentials. Build only a pushed master commit:

```bash
docker compose -p trading-stack-novius2 build n50-dashboard
docker compose -p trading-stack-novius2 up -d --no-deps n50-dashboard
```

Do not use `--remove-orphans`; other trading and notification containers are intentionally preserved. No database migration, collector restart, new polling timer or notification delivery is part of this UI change. Existing API and frontend module-disable flags remain unchanged; do not interpret module enablement as permission to execute trades.
