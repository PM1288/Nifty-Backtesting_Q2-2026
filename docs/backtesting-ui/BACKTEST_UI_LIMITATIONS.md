# Backtesting UI limitations and honest states

The UI must not infer research evidence that the published backtest does not supply.

- The current state is `INCONCLUSIVE` or `EXPLORATORY`, not research-accepted.
- Closed-trade win rate excludes open positions and must not be read as portfolio success probability.
- Out-of-sample, walk-forward, parameter-stability, capacity, and calibrated-target results are unavailable in this published payload.
- The NIFTY comparison is the published NIFTY 50 price-index benchmark. Dividend-inclusive total-return evidence is not claimed.
- The 35% deduction is a configurable research reserve applied to positive realized trade profit, not tax advice.
- India VIX/regime analytics remain on their dedicated pages; they were not fabricated inside the overview payload.
- Browser telemetry currently emits unrelated CSP/Matomo console noise in production. Acceptance tests treat only page errors and failed `/v1/backtesting` responses as dashboard failures.
- The dependency audit reported 12 existing package vulnerabilities during image build. They were not automatically upgraded because that is a separate dependency-risk change.
