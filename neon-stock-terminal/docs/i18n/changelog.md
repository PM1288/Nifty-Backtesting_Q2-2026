# i18n Changelog

## 2026-03-14

Localization architecture documented against the currently implemented web app.

Documented as implemented:

- locale model built from `language + digits`
- supported locale forms:
  - `en-IN-u-nu-latn`
  - `hi-IN-u-nu-latn`
  - `hi-IN-u-nu-deva`
  - `mr-IN-u-nu-latn`
  - `mr-IN-u-nu-deva`
- lazy-loaded namespace dictionaries via `import.meta.glob`
- glossary protection via shared glossary + uppercase token preservation
- shared formatter layer for numbers, INR, percent, compact values, date/time
- global header preference control for language and digits
- localStorage persistence
- Firebase profile preference sync
- Hindi/Marathi Devanagari-capable font stack

Current documented rollout gaps:

- shell/shared i18n foundation is in place
- page-level migration is still incomplete on some routes
- remaining hardcoded locale/date formatting still exists in a small set of pages and debug components

## Known current gaps

At the time of this documentation update, remaining rollout gaps still visible in source include:

- [AnalyticsSetupsPage.tsx](/C:/Github_sync/trading-stack/neon-stock-terminal/apps/web/src/pages/AnalyticsSetupsPage.tsx)
- [AnalyticsRiskPage.tsx](/C:/Github_sync/trading-stack/neon-stock-terminal/apps/web/src/pages/AnalyticsRiskPage.tsx)
- [AnalyticsRegimePage.tsx](/C:/Github_sync/trading-stack/neon-stock-terminal/apps/web/src/pages/AnalyticsRegimePage.tsx)
- [AnalyticsIndicatorsPage.tsx](/C:/Github_sync/trading-stack/neon-stock-terminal/apps/web/src/pages/AnalyticsIndicatorsPage.tsx)
- [BacktestingRegimeAnalysisPage.tsx](/C:/Github_sync/trading-stack/neon-stock-terminal/apps/web/src/pages/BacktestingRegimeAnalysisPage.tsx)
- [IndicatorEducationBlocks.tsx](/C:/Github_sync/trading-stack/neon-stock-terminal/apps/web/src/components/indicators/IndicatorEducationBlocks.tsx)
- [PerformanceDebugPanel.tsx](/C:/Github_sync/trading-stack/neon-stock-terminal/apps/web/src/analytics/PerformanceDebugPanel.tsx)
- [useIndicatorAnalytics.tsx](/C:/Github_sync/trading-stack/neon-stock-terminal/apps/web/src/analytics/useIndicatorAnalytics.tsx)

These are rollout gaps, not architecture gaps.

## Scope note

This changelog only records the documentation state for i18n. No app code was changed as part of this documentation-only update.
