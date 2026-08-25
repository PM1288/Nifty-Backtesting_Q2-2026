# Playwright audit

> Evidence basis: static source inspection generated 2026-08-23T11:30:04.012Z. Runtime behaviour is labelled separately. “UNVERIFIED” means the source alone cannot establish the runtime condition.

Run from repository root:

```bash
PLAYWRIGHT_ORIGIN=http://127.0.0.1:19090 \
PLAYWRIGHT_ADMIN_PASSWORD_FILE=/home/novius2/trading-stack/.env \
node tests/documentation-audit/capture-all-pages.mjs
```

The script uses the existing authorised dev-login endpoint, captures all canonical static routes at 1920×1080, 1440×900, 1024×768, and 390×844, records response status, console errors, failed API requests, title/headings, overflow, and screenshot paths. Parameterized routes are resolved from deterministic representative defaults or marked **UNVERIFIED**.

<!-- RUNTIME_AUDIT_START -->
## Observed results

| Route | Viewport | HTTP | Result | First heading | API errors | Console errors | Overflow | Elapsed ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| / | 1024x768 | 200 | CAPTURED | Where this evidence is concentrated | 0 | 4 | NO | 5754 |
| / | 1440x900 | 200 | CAPTURED | Where this evidence is concentrated | 0 | 0 | NO | 11859 |
| / | 1920x1080 | 200 | CAPTURED | Where this evidence is concentrated | 0 | 4 | NO | 12627 |
| / | 390x844 | 200 | CAPTURED | Where this evidence is concentrated | 0 | 0 | NO | 3917 |
| /analytics | 1024x768 | 200 | CAPTURED | Market headline | 0 | 0 | NO | 6072 |
| /analytics | 1440x900 | 200 | CAPTURED | Market headline | 0 | 0 | NO | 7046 |
| /analytics | 1920x1080 | 200 | CAPTURED | Market headline | 0 | 4 | NO | 8452 |
| /analytics | 390x844 | 200 | CAPTURED | Market headline | 0 | 0 | NO | 3796 |
| /analytics/daily-setups | 1024x768 | 200 | CAPTURED | — | 0 | 0 | NO | 9338 |
| /analytics/daily-setups | 1440x900 | 200 | CAPTURED | — | 0 | 0 | NO | 9359 |
| /analytics/daily-setups | 1920x1080 | 200 | CAPTURED | — | 0 | 4 | NO | 9443 |
| /analytics/daily-setups | 390x844 | 200 | CAPTURED | — | 0 | 0 | NO | 9152 |
| /analytics/flows | 1024x768 | 200 | CAPTURED | Use the archive after the guided review | 0 | 4 | NO | 2721 |
| /analytics/flows | 1440x900 | 200 | CAPTURED | Use the archive after the guided review | 0 | 0 | NO | 8997 |
| /analytics/flows | 1920x1080 | 200 | CAPTURED | Use the archive after the guided review | 0 | 0 | NO | 7541 |
| /analytics/flows | 390x844 | 200 | CAPTURED | Use the archive after the guided review | 0 | 0 | NO | 2592 |
| /analytics/indicators | 1024x768 | 200 | CAPTURED | What it is and how to read it | 0 | 0 | NO | 5778 |
| /analytics/indicators | 1440x900 | 200 | CAPTURED | What it is and how to read it | 0 | 0 | NO | 5988 |
| /analytics/indicators | 1920x1080 | 200 | CAPTURED | What it is and how to read it | 0 | 4 | NO | 10546 |
| /analytics/indicators | 390x844 | 200 | CAPTURED | What it is and how to read it | 0 | 0 | NO | 8965 |
| /analytics/indicators/:slug | 1024x768 | 200 | CAPTURED | What it is and how to read it | 0 | 0 | NO | 5729 |
| /analytics/indicators/:slug | 1440x900 | 200 | CAPTURED | What it is and how to read it | 0 | 0 | NO | 5185 |
| /analytics/indicators/:slug | 1920x1080 | 200 | CAPTURED | What it is and how to read it | 0 | 4 | NO | 9017 |
| /analytics/indicators/:slug | 390x844 | 200 | CAPTURED | What it is and how to read it | 0 | 0 | NO | 3466 |
| /analytics/leadership | 1024x768 | 200 | CAPTURED | Leadership summary | 0 | 0 | NO | 9327 |
| /analytics/leadership | 1440x900 | 200 | CAPTURED | Leadership summary | 0 | 0 | NO | 9248 |
| /analytics/leadership | 1920x1080 | 200 | CAPTURED | Leadership summary | 0 | 4 | NO | 9484 |
| /analytics/leadership | 390x844 | 200 | CAPTURED | Leadership summary | 0 | 0 | NO | 9241 |
| /analytics/learn | 1024x768 | 200 | CAPTURED | Strategy lab | 0 | 0 | NO | 9657 |
| /analytics/learn | 1440x900 | 200 | CAPTURED | Strategy lab | 0 | 0 | NO | 3190 |
| /analytics/learn | 1920x1080 | 200 | CAPTURED | Strategy lab | 0 | 4 | NO | 4108 |
| /analytics/learn | 390x844 | 200 | CAPTURED | Strategy lab | 0 | 0 | NO | 2768 |
| /analytics/regime | 1024x768 | 200 | CAPTURED | Regime stability | 0 | 0 | NO | 2632 |
| /analytics/regime | 1440x900 | 200 | CAPTURED | Regime stability | 0 | 0 | NO | 9717 |
| /analytics/regime | 1920x1080 | 200 | CAPTURED | Regime stability | 0 | 4 | NO | 2956 |
| /analytics/regime | 390x844 | 200 | CAPTURED | Regime stability | 0 | 0 | NO | 2509 |
| /analytics/risk | 1024x768 | 200 | CAPTURED | Events & Flows | 0 | 0 | NO | 2715 |
| /analytics/risk | 1440x900 | 200 | CAPTURED | Events & Flows | 0 | 0 | NO | 3209 |
| /analytics/risk | 1920x1080 | 200 | CAPTURED | Events & Flows | 0 | 4 | NO | 3690 |
| /analytics/risk | 390x844 | 200 | CAPTURED | Events & Flows | 0 | 0 | NO | 2510 |
| /analytics/simulator | 1024x768 | 200 | CAPTURED | What this scenario is asking you to tolerate | 0 | 0 | NO | 3311 |
| /analytics/simulator | 1440x900 | 200 | CAPTURED | What this scenario is asking you to tolerate | 0 | 0 | NO | 4504 |
| /analytics/simulator | 1920x1080 | 200 | CAPTURED | What this scenario is asking you to tolerate | 0 | 4 | NO | 4318 |
| /analytics/simulator | 390x844 | 200 | CAPTURED | What this scenario is asking you to tolerate | 0 | 0 | NO | 3597 |
| /analytics/stock/:symbol | 1024x768 | 200 | CAPTURED | Quick read / current state | 0 | 0 | NO | 5984 |
| /analytics/stock/:symbol | 1440x900 | 200 | CAPTURED | Quick read / current state | 0 | 0 | NO | 3603 |
| /analytics/stock/:symbol | 1920x1080 | 200 | CAPTURED | Quick read / current state | 0 | 4 | NO | 5028 |
| /analytics/stock/:symbol | 390x844 | 200 | CAPTURED | Quick read / current state | 0 | 0 | NO | 8338 |
| /analytics/system/map | 1024x768 | 200 | CAPTURED | From market tape to user decision | 0 | 4 | NO | 2184 |
| /analytics/system/map | 1440x900 | 200 | CAPTURED | From market tape to user decision | 0 | 0 | NO | 2928 |
| /analytics/system/map | 1920x1080 | 200 | CAPTURED | From market tape to user decision | 0 | 0 | NO | 2796 |
| /analytics/system/map | 390x844 | 200 | CAPTURED | From market tape to user decision | 0 | 0 | NO | 2529 |
| /analytics/system/quality | 1024x768 | 200 | CAPTURED | freshness by source | 0 | 4 | NO | 2773 |
| /analytics/system/quality | 1440x900 | 200 | CAPTURED | freshness by source | 0 | 0 | NO | 3253 |
| /analytics/system/quality | 1920x1080 | 200 | CAPTURED | freshness by source | 0 | 0 | NO | 3605 |
| /analytics/system/quality | 390x844 | 200 | CAPTURED | freshness by source | 0 | 0 | NO | 2754 |
| /backtesting | 1024x768 | 200 | CAPTURED | What happened, and why | 0 | 0 | NO | 3553 |
| /backtesting | 1440x900 | 200 | CAPTURED | What happened, and why | 0 | 0 | NO | 2792 |
| /backtesting | 1920x1080 | 200 | CAPTURED | What happened, and why | 0 | 0 | NO | 3605 |
| /backtesting | 390x844 | 200 | CAPTURED | What happened, and why | 0 | 0 | NO | 2575 |
| /backtesting/compare | 1024x768 | 200 | CAPTURED | Normalized equity curves | 0 | 0 | NO | 3322 |
| /backtesting/compare | 1440x900 | 200 | CAPTURED | Normalized equity curves | 0 | 0 | NO | 3611 |
| /backtesting/compare | 1920x1080 | 200 | CAPTURED | Normalized equity curves | 0 | 0 | NO | 4727 |
| /backtesting/compare | 390x844 | 200 | CAPTURED | Normalized equity curves | 0 | 0 | NO | 2823 |
| /backtesting/daily-summary | 1024x768 | 200 | CAPTURED | Skipped-signal reasons | 0 | 0 | NO | 2318 |
| /backtesting/daily-summary | 1440x900 | 200 | CAPTURED | Skipped-signal reasons | 0 | 0 | NO | 9479 |
| /backtesting/daily-summary | 1920x1080 | 200 | CAPTURED | Skipped-signal reasons | 0 | 0 | NO | 3282 |
| /backtesting/daily-summary | 390x844 | 200 | CAPTURED | Skipped-signal reasons | 0 | 0 | NO | 2277 |
| /backtesting/h30 | 1024x768 | 200 | CAPTURED | Ranking governance | 0 | 0 | NO | 4948 |
| /backtesting/h30 | 1440x900 | 200 | CAPTURED | Ranking governance | 0 | 0 | NO | 5731 |
| /backtesting/h30 | 1920x1080 | 200 | CAPTURED | Ranking governance | 0 | 0 | NO | 10974 |
| /backtesting/h30 | 390x844 | 200 | CAPTURED | Ranking governance | 0 | 0 | NO | 2612 |
| /backtesting/lab | 1024x768 | 200 | CAPTURED | Recent experiments | 0 | 0 | NO | 3330 |
| /backtesting/lab | 1440x900 | 200 | CAPTURED | Recent experiments | 0 | 0 | NO | 4620 |
| /backtesting/lab | 1920x1080 | 200 | CAPTURED | Recent experiments | 0 | 0 | NO | 3967 |
| /backtesting/lab | 390x844 | 200 | CAPTURED | Recent experiments | 0 | 0 | NO | 5200 |
| /backtesting/regimes | 1024x768 | 200 | CAPTURED | Regime win-rate bars | 0 | 0 | NO | 2688 |
| /backtesting/regimes | 1440x900 | 200 | CAPTURED | Regime win-rate bars | 0 | 0 | NO | 2608 |
| /backtesting/regimes | 1920x1080 | 200 | CAPTURED | Regime win-rate bars | 0 | 0 | NO | 10297 |
| /backtesting/regimes | 390x844 | 200 | CAPTURED | Regime win-rate bars | 0 | 0 | NO | 2702 |
| /backtesting/results | 1024x768 | 200 | CAPTURED | Equity vs FD | 0 | 0 | NO | 3735 |
| /backtesting/results | 1440x900 | 200 | CAPTURED | Equity vs FD | 0 | 0 | NO | 3636 |
| /backtesting/results | 1920x1080 | 200 | CAPTURED | Equity vs FD | 0 | 0 | NO | 6474 |
| /backtesting/results | 390x844 | 200 | CAPTURED | Equity vs FD | 0 | 0 | NO | 3419 |
| /backtesting/runs | 1024x768 | 200 | CAPTURED | Recent run health | 0 | 0 | NO | 9999 |
| /backtesting/runs | 1440x900 | 200 | CAPTURED | Recent run health | 0 | 0 | NO | 11212 |
| /backtesting/runs | 1920x1080 | 200 | CAPTURED | Recent run health | 0 | 1 | NO | 29121 |
| /backtesting/runs | 390x844 | 200 | CAPTURED | Recent run health | 0 | 0 | NO | 3960 |
| /backtesting/stocks | 1024x768 | 200 | CAPTURED | Top outcome bars | 0 | 0 | NO | 3811 |
| /backtesting/stocks | 1440x900 | 200 | CAPTURED | Top outcome bars | 0 | 0 | NO | 4068 |
| /backtesting/stocks | 1920x1080 | 200 | CAPTURED | Top outcome bars | 0 | 0 | NO | 7130 |
| /backtesting/stocks | 390x844 | 200 | CAPTURED | Top outcome bars | 0 | 0 | NO | 3681 |
| /backtesting/strategies | 1024x768 | 200 | CAPTURED | Published strategy leaderboard | 0 | 0 | NO | 2438 |
| /backtesting/strategies | 1440x900 | 200 | CAPTURED | Published strategy leaderboard | 0 | 0 | NO | 2762 |
| /backtesting/strategies | 1920x1080 | 200 | CAPTURED | Published strategy leaderboard | 0 | 0 | NO | 2682 |
| /backtesting/strategies | 390x844 | 200 | CAPTURED | Published strategy leaderboard | 0 | 0 | NO | 2383 |
| /backtesting/strategies/:strategyId | 1024x768 | 200 | CAPTURED | The portfolio finished below starting capital; the current evidence does not support promotion. | 0 | 0 | NO | 3182 |
| /backtesting/strategies/:strategyId | 1440x900 | 200 | CAPTURED | The portfolio finished below starting capital; the current evidence does not support promotion. | 0 | 0 | NO | 3232 |
| /backtesting/strategies/:strategyId | 1920x1080 | 200 | CAPTURED | The portfolio finished below starting capital; the current evidence does not support promotion. | 0 | 0 | NO | 4803 |
| /backtesting/strategies/:strategyId | 390x844 | 200 | CAPTURED | The portfolio finished below starting capital; the current evidence does not support promotion. | 0 | 0 | NO | 2986 |
| /catalysts/context | 1024x768 | 200 | CAPTURED | Upcoming catalysts | 0 | 0 | NO | 9227 |
| /catalysts/context | 1440x900 | 200 | CAPTURED | event calendar heatmap | 0 | 0 | NO | 7691 |
| /catalysts/context | 1920x1080 | 200 | CAPTURED | event calendar heatmap | 0 | 5 | NO | 7137 |
| /catalysts/context | 390x844 | 200 | CAPTURED | event calendar heatmap | 0 | 0 | NO | 4069 |
| /catalysts/events | 1024x768 | 200 | CAPTURED | Calendar heatmap | 0 | 0 | NO | 7313 |
| /catalysts/events | 1440x900 | 200 | CAPTURED | Total events | 0 | 0 | NO | 9369 |
| /catalysts/events | 1920x1080 | 200 | CAPTURED | Calendar heatmap | 0 | 4 | NO | 9776 |
| /catalysts/events | 390x844 | 200 | CAPTURED | Total events | 0 | 0 | NO | 9268 |
| /control-plane | 1024x768 | 200 | CAPTURED | SmartAPI collector status | 0 | 4 | NO | 4016 |
| /control-plane | 1440x900 | 200 | CAPTURED | SmartAPI collector status | 0 | 0 | NO | 6048 |
| /control-plane | 1920x1080 | 200 | CAPTURED | SmartAPI collector status | 0 | 0 | NO | 9672 |
| /control-plane | 390x844 | 200 | CAPTURED | SmartAPI collector status | 0 | 0 | NO | 3352 |
| /dashboard/stocks/:symbol | 1024x768 | 200 | CAPTURED | Price context | 0 | 5 | NO | 9193 |
| /dashboard/stocks/:symbol | 1440x900 | 200 | CAPTURED | Quick read / current state | 0 | 0 | NO | 10855 |
| /dashboard/stocks/:symbol | 1920x1080 | 200 | CAPTURED | Quick read / current state | 0 | 4 | NO | 10998 |
| /dashboard/stocks/:symbol | 390x844 | 200 | CAPTURED | Price context | 0 | 0 | NO | 9301 |
| /feedback | 1024x768 | 200 | CAPTURED | Tell us what needs work | 0 | 0 | NO | 2667 |
| /feedback | 1440x900 | 200 | CAPTURED | Tell us what needs work | 0 | 0 | NO | 2698 |
| /feedback | 1920x1080 | 200 | CAPTURED | Tell us what needs work | 0 | 0 | NO | 3370 |
| /feedback | 390x844 | 200 | CAPTURED | Tell us what needs work | 0 | 0 | NO | 3341 |
| /futures | 1024x768 | 200 | DEGRADED | — | 1 | 5 | NO | 2877 |
| /futures | 1440x900 | 200 | DEGRADED | — | 1 | 1 | NO | 8714 |
| /futures | 1920x1080 | 200 | DEGRADED | — | 1 | 1 | NO | 2672 |
| /futures | 390x844 | 200 | DEGRADED | — | 1 | 1 | NO | 3549 |
| /heatmap/change | 1024x768 | 200 | CAPTURED | Sector heatmap | 0 | 4 | NO | 2626 |
| /heatmap/change | 1440x900 | 200 | CAPTURED | Sector heatmap | 0 | 0 | NO | 3075 |
| /heatmap/change | 1920x1080 | 200 | CAPTURED | Sector heatmap | 0 | 0 | NO | 3301 |
| /heatmap/change | 390x844 | 200 | CAPTURED | Sector heatmap | 0 | 0 | NO | 2812 |
| /heatmap/rsi | 1024x768 | 200 | CAPTURED | RSI heatmap | 0 | 0 | NO | 3326 |
| /heatmap/rsi | 1440x900 | 200 | CAPTURED | RSI heatmap | 0 | 0 | NO | 9652 |
| /heatmap/rsi | 1920x1080 | 200 | CAPTURED | RSI heatmap | 0 | 0 | NO | 9955 |
| /heatmap/rsi | 390x844 | 200 | CAPTURED | RSI heatmap | 0 | 0 | NO | 2670 |
| /heatmap/will | 1024x768 | 200 | CAPTURED | WILLR heatmap | 0 | 0 | NO | 2853 |
| /heatmap/will | 1440x900 | 200 | CAPTURED | WILLR heatmap | 0 | 0 | NO | 2544 |
| /heatmap/will | 1920x1080 | 200 | CAPTURED | WILLR heatmap | 0 | 0 | NO | 2894 |
| /heatmap/will | 390x844 | 200 | CAPTURED | WILLR heatmap | 0 | 0 | NO | 2889 |
| /institutional/flow | 1024x768 | 200 | CAPTURED | FII / DII & Participant Flow | 0 | 0 | NO | 3508 |
| /institutional/flow | 1440x900 | 200 | CAPTURED | FII / DII & Participant Flow | 0 | 0 | NO | 3494 |
| /institutional/flow | 1920x1080 | 200 | CAPTURED | FII / DII & Participant Flow | 0 | 0 | NO | 5966 |
| /institutional/flow | 390x844 | 200 | CAPTURED | FII / DII & Participant Flow | 0 | 0 | NO | 3435 |
| /institutional/nse-intelligence | 1024x768 | 200 | CAPTURED | NSE Intelligence | 0 | 0 | NO | 3332 |
| /institutional/nse-intelligence | 1440x900 | 200 | CAPTURED | NSE Intelligence | 0 | 0 | NO | 7433 |
| /institutional/nse-intelligence | 1920x1080 | 200 | CAPTURED | NSE Intelligence | 0 | 0 | NO | 4699 |
| /institutional/nse-intelligence | 390x844 | 200 | CAPTURED | NSE Intelligence | 0 | 0 | NO | 4771 |
| /institutional/nse-intelligence/events | 1024x768 | 200 | CAPTURED | NSE Intelligence | 0 | 0 | NO | 4147 |
| /institutional/nse-intelligence/events | 1440x900 | 200 | CAPTURED | NSE Intelligence | 0 | 0 | NO | 3294 |
| /institutional/nse-intelligence/events | 1920x1080 | 200 | CAPTURED | NSE Intelligence | 0 | 0 | NO | 3858 |
| /institutional/nse-intelligence/events | 390x844 | 200 | CAPTURED | NSE Intelligence | 0 | 0 | NO | 3045 |
| /institutional/nse-intelligence/fno | 1024x768 | 200 | CAPTURED | NSE Intelligence | 0 | 0 | NO | 3527 |
| /institutional/nse-intelligence/fno | 1440x900 | 200 | CAPTURED | NSE Intelligence | 0 | 0 | NO | 5124 |
| /institutional/nse-intelligence/fno | 1920x1080 | 200 | CAPTURED | NSE Intelligence | 0 | 0 | NO | 4119 |
| /institutional/nse-intelligence/fno | 390x844 | 200 | CAPTURED | NSE Intelligence | 0 | 0 | NO | 7739 |
| /institutional/nse-intelligence/reports | 1024x768 | 200 | CAPTURED | NSE Intelligence | 0 | 0 | NO | 3421 |
| /institutional/nse-intelligence/reports | 1440x900 | 200 | CAPTURED | NSE Intelligence | 0 | 0 | NO | 3027 |
| /institutional/nse-intelligence/reports | 1920x1080 | 200 | CAPTURED | NSE Intelligence | 0 | 0 | NO | 4812 |
| /institutional/nse-intelligence/reports | 390x844 | 200 | CAPTURED | NSE Intelligence | 0 | 0 | NO | 3631 |
| /institutional/nse-intelligence/sectors | 1024x768 | 200 | CAPTURED | NSE Intelligence | 0 | 0 | NO | 4221 |
| /institutional/nse-intelligence/sectors | 1440x900 | 200 | CAPTURED | NSE Intelligence | 0 | 0 | NO | 2921 |
| /institutional/nse-intelligence/sectors | 1920x1080 | 200 | CAPTURED | NSE Intelligence | 0 | 0 | NO | 3973 |
| /institutional/nse-intelligence/sectors | 390x844 | 200 | CAPTURED | NSE Intelligence | 0 | 0 | NO | 3648 |
| /institutional/reports | 1024x768 | 200 | CAPTURED | Run browser | 0 | 0 | NO | 2462 |
| /institutional/reports | 1440x900 | 200 | CAPTURED | Run browser | 0 | 0 | NO | 2514 |
| /institutional/reports | 1920x1080 | 200 | CAPTURED | Run browser | 0 | 0 | NO | 2651 |
| /institutional/reports | 390x844 | 200 | CAPTURED | Run browser | 0 | 0 | NO | 7008 |
| /market/nifty-500 | 1024x768 | 200 | CAPTURED | Last 30 sessions | 0 | 4 | NO | 2764 |
| /market/nifty-500 | 1440x900 | 200 | CAPTURED | Last 30 sessions | 0 | 0 | NO | 4387 |
| /market/nifty-500 | 1920x1080 | 200 | CAPTURED | Last 30 sessions | 0 | 0 | NO | 4376 |
| /market/nifty-500 | 390x844 | 200 | CAPTURED | Last 30 sessions | 0 | 0 | NO | 3298 |
| /options/intelligence | 1024x768 | 200 | CAPTURED | Options Intelligence | 0 | 0 | NO | 3869 |
| /options/intelligence | 1440x900 | 200 | CAPTURED | Options Intelligence | 0 | 4 | NO | 6900 |
| /options/intelligence | 1920x1080 | 200 | CAPTURED | Options Intelligence | 0 | 0 | NO | 5406 |
| /options/intelligence | 390x844 | 200 | CAPTURED | Options Intelligence | 0 | 0 | NO | 6388 |
| /options/snapshot | 1024x768 | 200 | CAPTURED | Expiry context, equilibrium, and ATM premium pressure | 0 | 0 | NO | 2843 |
| /options/snapshot | 1440x900 | 200 | CAPTURED | Expiry context, equilibrium, and ATM premium pressure | 0 | 4 | NO | 4535 |
| /options/snapshot | 1920x1080 | 200 | CAPTURED | Expiry context, equilibrium, and ATM premium pressure | 0 | 0 | NO | 3621 |
| /options/snapshot | 390x844 | 200 | CAPTURED | Expiry context, equilibrium, and ATM premium pressure | 0 | 0 | NO | 9728 |
| /options/structure | 1024x768 | 200 | CAPTURED | PCR by expiry | 0 | 0 | NO | 9545 |
| /options/structure | 1440x900 | 200 | CAPTURED | Structure summary | 0 | 2 | NO | 9247 |
| /options/structure | 1920x1080 | 200 | CAPTURED | PCR by expiry | 0 | 0 | NO | 11092 |
| /options/structure | 390x844 | 200 | CAPTURED | Structure summary | 0 | 0 | NO | 9232 |
| /options/volatility-signals | 1024x768 | 200 | CAPTURED | F&O Straddle & Strangle Signals | 0 | 0 | NO | 5000 |
| /options/volatility-signals | 1440x900 | 200 | CAPTURED | F&O Straddle & Strangle Signals | 0 | 4 | NO | 5021 |
| /options/volatility-signals | 1920x1080 | 200 | CAPTURED | F&O Straddle & Strangle Signals | 0 | 0 | NO | 6918 |
| /options/volatility-signals | 390x844 | 200 | CAPTURED | F&O Straddle & Strangle Signals | 0 | 0 | NO | 3197 |
| /paper-trading | 1024x768 | 200 | CAPTURED | Paper Trading Evidence Workbench | 0 | 4 | NO | 10834 |
| /paper-trading | 1440x900 | 200 | CAPTURED | Paper Trading Evidence Workbench | 0 | 0 | NO | 9246 |
| /paper-trading | 1920x1080 | 200 | CAPTURED | Paper Trading Evidence Workbench | 0 | 0 | NO | 11643 |
| /paper-trading | 390x844 | 200 | CAPTURED | Paper Trading Evidence Workbench | 0 | 1 | NO | 11759 |
| /stock/:symbol | 1024x768 | 200 | CAPTURED | Price context | 0 | 0 | NO | 9165 |
| /stock/:symbol | 1440x900 | 200 | CAPTURED | Quick read / current state | 0 | 0 | NO | 9989 |
| /stock/:symbol | 1920x1080 | 200 | CAPTURED | Quick read / current state | 0 | 0 | NO | 9436 |
| /stock/:symbol | 390x844 | 200 | CAPTURED | Price context | 0 | 0 | NO | 9195 |
| /strategy/long-options | 1024x768 | 200 | CAPTURED | Long-Only Options Router | 0 | 4 | NO | 2367 |
| /strategy/long-options | 1440x900 | 200 | CAPTURED | Long-Only Options Router | 0 | 0 | NO | 3178 |
| /strategy/long-options | 1920x1080 | 200 | CAPTURED | Long-Only Options Router | 0 | 0 | NO | 4061 |
| /strategy/long-options | 390x844 | 200 | CAPTURED | Long-Only Options Router | 0 | 0 | NO | 6262 |
| /strategy/monthly | 1024x768 | 200 | CAPTURED | Monthly Strategy | 0 | 4 | NO | 21500 |
| /strategy/monthly | 1440x900 | 200 | CAPTURED | Monthly Strategy | 0 | 0 | NO | 23947 |
| /strategy/monthly | 1920x1080 | 200 | CAPTURED | Monthly Strategy | 0 | 0 | NO | 45695 |
| /strategy/monthly | 390x844 | 200 | CAPTURED | Monthly Strategy | 0 | 0 | NO | 21332 |
| /strategy/nifty-options | 1024x768 | 200 | CAPTURED | NIFTY Weekly & Monthly Options | 0 | 4 | NO | 2745 |
| /strategy/nifty-options | 1440x900 | 200 | CAPTURED | NIFTY Weekly & Monthly Options | 0 | 0 | NO | 2940 |
| /strategy/nifty-options | 1920x1080 | 200 | CAPTURED | NIFTY Weekly & Monthly Options | 0 | 0 | NO | 4387 |
| /strategy/nifty-options | 390x844 | 200 | CAPTURED | NIFTY Weekly & Monthly Options | 0 | 0 | NO | 3264 |
| /strategy/nifty-weekly-options | 1024x768 | 200 | CAPTURED | NIFTY Weekly & Monthly Options | 0 | 1 | NO | 2563 |
| /strategy/nifty-weekly-options | 1440x900 | 200 | CAPTURED | NIFTY Weekly & Monthly Options | 0 | 0 | NO | 3539 |
| /strategy/nifty-weekly-options | 1920x1080 | 200 | CAPTURED | NIFTY Weekly & Monthly Options | 0 | 0 | NO | 2964 |
| /strategy/nifty-weekly-options | 390x844 | 200 | CAPTURED | NIFTY Weekly & Monthly Options | 0 | 0 | NO | 2546 |
| /strategy/oiis-live | 1024x768 | 200 | CAPTURED | Daily stock selection desk | 0 | 2 | NO | 9478 |
| /strategy/oiis-live | 1440x900 | 200 | CAPTURED | Daily stock selection desk | 0 | 4 | NO | 2690 |
| /strategy/oiis-live | 1920x1080 | 200 | CAPTURED | Daily stock selection desk | 0 | 1 | NO | 3015 |
| /strategy/oiis-live | 390x844 | 200 | CAPTURED | Daily stock selection desk | 0 | 0 | NO | 2611 |
| /strategy/oiis-live/history | 1024x768 | 200 | CAPTURED | 30-minute run history | 0 | 4 | NO | 5276 |
| /strategy/oiis-live/history | 1440x900 | 200 | CAPTURED | 30-minute run history | 0 | 4 | NO | 3572 |
| /strategy/oiis-live/history | 1920x1080 | 200 | CAPTURED | 30-minute run history | 0 | 0 | NO | 10457 |
| /strategy/oiis-live/history | 390x844 | 200 | CAPTURED | 30-minute run history | 0 | 0 | NO | 9442 |
| /strategy/rolling-monthly | 1024x768 | 200 | CAPTURED | Rolling Strategy | 0 | 4 | NO | 24839 |
| /strategy/rolling-monthly | 1440x900 | 200 | CAPTURED | Rolling Strategy | 0 | 0 | NO | 20977 |
| /strategy/rolling-monthly | 1920x1080 | 200 | CAPTURED | Rolling Strategy | 0 | 0 | NO | 47094 |
| /strategy/rolling-monthly | 390x844 | 200 | CAPTURED | Rolling Strategy | 0 | 0 | NO | 23957 |
| /strategy/rolling-monthly/legacy | 1024x768 | 200 | CAPTURED | Rolling Monthly | 0 | 4 | NO | 4091 |
| /strategy/rolling-monthly/legacy | 1440x900 | 200 | CAPTURED | Rolling Monthly | 0 | 0 | NO | 5618 |
| /strategy/rolling-monthly/legacy | 1920x1080 | 200 | CAPTURED | Rolling Monthly | 0 | 0 | NO | 5107 |
| /strategy/rolling-monthly/legacy | 390x844 | 200 | CAPTURED | Rolling Monthly | 0 | 0 | NO | 4525 |


### Interpretation

- Four Futures captures are **DEGRADED** because `GET /v1/workspace/futures` returned HTTP 500.
- All four current Paper Trading captures loaded the 35-trade ledger; the independent request sample still took 19338 ms.
- Microsoft Clarity collector subdomains generated repeated CSP console errors. These are retained in evidence and are not counted as API failures.
- Browser capture concurrency produced a small number of generic network-change/400 console messages without request URLs; causality is **UNVERIFIED**.
- No viewport-level horizontal body overflow was detected.

## Accessibility scan

| Screen | Viewport | Rule | Impact | Affected nodes | Help |
| --- | --- | --- | --- | --- | --- |
| oiis-lab | desktop | color-contrast | serious | 1 | Elements must meet minimum color contrast ratio thresholds |


Result: 16 scans, 1 violation(s), 1 affected node(s). The command exited non-zero and is recorded as a failed acceptance check.
<!-- RUNTIME_AUDIT_END -->
