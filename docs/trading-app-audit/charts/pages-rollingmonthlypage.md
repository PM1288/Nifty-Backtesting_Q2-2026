# pages-rollingmonthlypage

> Evidence basis: static source inspection generated 2026-08-23T11:30:04.012Z. Runtime behaviour is labelled separately. “UNVERIFIED” means the source alone cannot establish the runtime condition.

## Identity

| Field | Value |
| --- | --- |
| Source | [neon-stock-terminal/apps/web/src/pages/RollingMonthlyPage.tsx](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/neon-stock-terminal/apps/web/src/pages/RollingMonthlyPage.tsx) |
| Components | `RollingMonthlyPage`, `FIRST_SESSION_PERFORMANCE_THRESHOLDS` |
| Library | Apache ECharts 6 |
| Pages | `/dashboard/stocks/:symbol`, `/strategy/rolling-monthly/legacy`, `/stock/:symbol` |
| Titles found | Rolling Monthly data could not be loaded; No completed Rolling Monthly run; Rolling Monthly; Rolling Monthly view filters; No base-scanner match; Expiry cohort reports; No scanner match at the latest expiry; Success rate ${pct(successRate)}; Expiry history is not available; Absolute Monthly report filters; Absolute Monthly history could not be loaded; No absolute-month opportunity for this filter; Absolute first-session report filters; First-session analysis could not be loaded; First-session favourable target attainment and drawdown incidence; Row colour scale from minus ten to plus ten percent final return; No first-session setup for this filter; ${weeklyChart?.candidate.symbol ?? absoluteChart?.candidate.symbol ?? firstSessionChart?.candidate.s; Close candlestick chart; Candlestick chart unavailable; Absolute Monthly selected entry and outcome; Absolute first-session entry and outcome; Rolling Monthly qualification and entry events |
| Direct API paths | Supplied through props/hooks |

## Business meaning and interpretation

The visible title, axes, series encodings, and surrounding copy in the linked source define what the chart says. It is descriptive/diagnostic unless the source explicitly identifies a predictive model. Do not infer executable returns from MFE, simulated, hypothetical, or interpolated surfaces.

## Configuration and data input

Inspect the linked option/series construction for axes, tooltips, legends, thresholds, null handling, timezone, colour, and precision. Where data arrives by props, follow the parent component through [component-map.json](../evidence/component-map.json).

## Accuracy considerations

Validate population, eligibility, as-of timestamp, missing-value handling, session boundaries, adjusted/unadjusted price basis, and interpolation before using the visual for decisions. Runtime and independent-calculation evidence is catalogued centrally.
