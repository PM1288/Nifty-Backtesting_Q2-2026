# Rolling Monthly chart entry markers

Deployed 13 August 2026.

The Rolling Monthly weekly candlestick chart now distinguishes the strategy timeline from ordinary price movement:

- purple circles identify sessions where the Rolling Monthly conditions were met;
- blue diamonds identify the actual next-session entry price;
- solid blue vertical lines identify each entry week;
- the selected candidate receives the visible `Selected entry` annotation;
- earlier condition/entry events for the same symbol remain visible without duplicating large labels;
- the evidence list below the chart states signal date, entry date, entry price, side and entry eligibility for current and historical events.

The chart endpoint now returns `qualificationEvents` from canonical `rolling_monthly.candidate` rows. It does not infer events from candle shape. Current candidates and historical expiry-cohort stocks both open the same evidence chart.

Validation:

- API and web TypeScript typechecks passed.
- Rolling Monthly API tests passed 3/3.
- Production build and container health passed.
- Authenticated desktop/mobile Playwright passed 34/34.
- Screenshots and results: `/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/tools/playwright/output/playwright/rolling-monthly-expiry`.
