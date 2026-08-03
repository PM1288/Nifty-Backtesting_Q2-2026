# i18n Overview

This document describes the current localization architecture for the N50 dashboard web app.

The implemented direction is:

- 3 UI languages: English (`en`), Hindi (`hi`), Marathi (`mr`)
- independent digit preference: Latin digits (`latn`) or Devanagari digits (`deva`)
- locale composed from language + digits using the Unicode numbering-system extension
- shared Intl-based formatters for numbers, INR currency, percentages, compact values, dates, and time
- glossary protection so finance terms, ticker symbols, and indicator abbreviations do not get translated accidentally
- lazy-loaded locale dictionaries by namespace
- global preference control in the header area

The app code for this lives under:

- [LocaleProvider.tsx](/C:/Github_sync/trading-stack/neon-stock-terminal/apps/web/src/i18n/LocaleProvider.tsx)
- [types.ts](/C:/Github_sync/trading-stack/neon-stock-terminal/apps/web/src/i18n/types.ts)
- [format.ts](/C:/Github_sync/trading-stack/neon-stock-terminal/apps/web/src/lib/format.ts)
- [AppShell.tsx](/C:/Github_sync/trading-stack/neon-stock-terminal/apps/web/src/components/chrome/AppShell.tsx)
- [global.css](/C:/Github_sync/trading-stack/neon-stock-terminal/apps/web/src/styles/global.css)
- [tokens.css](/C:/Github_sync/trading-stack/neon-stock-terminal/apps/web/src/styles/tokens.css)

## Locale model

The effective locale is built as:

- `en-IN-u-nu-latn`
- `hi-IN-u-nu-latn`
- `hi-IN-u-nu-deva`
- `mr-IN-u-nu-latn`
- `mr-IN-u-nu-deva`

Current implementation:

- `UiLanguage = "en" | "hi" | "mr"`
- `DigitSystem = "latn" | "deva"`
- locale string built by `buildLocale(language, digits)` in [LocaleProvider.tsx](/C:/Github_sync/trading-stack/neon-stock-terminal/apps/web/src/i18n/LocaleProvider.tsx)
- formatters read the active locale via `setFormattingLocale(...)` in [format.ts](/C:/Github_sync/trading-stack/neon-stock-terminal/apps/web/src/lib/format.ts)

## Dictionaries and lazy loading

The app currently uses namespace-based JSON dictionaries under:

- [locales/en/common.json](/C:/Github_sync/trading-stack/neon-stock-terminal/apps/web/src/locales/en/common.json)
- [locales/en/market.json](/C:/Github_sync/trading-stack/neon-stock-terminal/apps/web/src/locales/en/market.json)
- [locales/en/backtesting.json](/C:/Github_sync/trading-stack/neon-stock-terminal/apps/web/src/locales/en/backtesting.json)
- [locales/hi/common.json](/C:/Github_sync/trading-stack/neon-stock-terminal/apps/web/src/locales/hi/common.json)
- [locales/hi/market.json](/C:/Github_sync/trading-stack/neon-stock-terminal/apps/web/src/locales/hi/market.json)
- [locales/hi/backtesting.json](/C:/Github_sync/trading-stack/neon-stock-terminal/apps/web/src/locales/hi/backtesting.json)
- [locales/mr/common.json](/C:/Github_sync/trading-stack/neon-stock-terminal/apps/web/src/locales/mr/common.json)
- [locales/mr/market.json](/C:/Github_sync/trading-stack/neon-stock-terminal/apps/web/src/locales/mr/market.json)
- [locales/mr/backtesting.json](/C:/Github_sync/trading-stack/neon-stock-terminal/apps/web/src/locales/mr/backtesting.json)
- [locales/glossary.json](/C:/Github_sync/trading-stack/neon-stock-terminal/apps/web/src/locales/glossary.json)

`LocaleProvider` loads the active language bundles lazily using:

- `import.meta.glob("../locales/*/*.json")`

This keeps Hindi and Marathi dictionary payloads out of the initial bundle until selected.

## Preference model

The current global preference control is in the app shell:

- Language
- Digits

The control is rendered in [AppShell.tsx](/C:/Github_sync/trading-stack/neon-stock-terminal/apps/web/src/components/chrome/AppShell.tsx).

Persistence behavior:

- local storage keys:
  - `n50.locale.language`
  - `n50.locale.digits`
- logged-in user sync to Firebase profile preferences:
  - `profiles/{uid}/preferences/locale`

Firebase sync is best-effort and is implemented in:

- [firebase.ts](/C:/Github_sync/trading-stack/neon-stock-terminal/apps/web/src/lib/firebase.ts)
- [LocaleProvider.tsx](/C:/Github_sync/trading-stack/neon-stock-terminal/apps/web/src/i18n/LocaleProvider.tsx)

## Fonts

The current font stack is:

- English UI: Inter Variable
- Hindi/Marathi UI: Hind
- fallback: Noto Sans Devanagari
- dense numeric/monospace views: IBM Plex Mono

Rules currently encoded in CSS:

- default UI font uses Inter
- Hindi/Marathi switch `--font-ui` to the Devanagari stack
- Latin digit mode uses the numeric mono stack
- Devanagari digit mode switches numeric text back to the Devanagari stack

See:

- [global.css](/C:/Github_sync/trading-stack/neon-stock-terminal/apps/web/src/styles/global.css)
- [tokens.css](/C:/Github_sync/trading-stack/neon-stock-terminal/apps/web/src/styles/tokens.css)

## Shared formatter surface

Current shared formatters:

- `formatNumber()`
- `formatCompactIN()`
- `formatCurrencyINR()`
- `formatCompactCurrency()`
- `formatPercent()`
- `formatDateTime()`
- `formatTime()`
- compatibility aliases:
  - `formatNumberIN()`
  - `formatDateIST()`

Source:

- [format.ts](/C:/Github_sync/trading-stack/neon-stock-terminal/apps/web/src/lib/format.ts)

These formatters are intended to be used everywhere for:

- KPI cards
- tables
- chart axes
- chart tooltips
- legends
- backtesting summaries
- option-chain values
- simulator values

## Glossary protection

The localization layer protects finance and market tokens through:

- a shared glossary term list
- a regex pass that preserves glossary terms in translated strings
- a fallback rule that also preserves all-uppercase ticker-like tokens

This is important for:

- `RSI`, `MACD`, `WILLR`, `IV`, `PCR`, `CE`, `PE`
- `NIFTY 50`, `BANKNIFTY`, `INDIA VIX`
- stock symbols like `HDFCBANK`, `RELIANCE`, `SBIN`
- exchange abbreviations and other raw market codes

See:

- [glossary.json](/C:/Github_sync/trading-stack/neon-stock-terminal/apps/web/src/locales/glossary.json)
- [LocaleProvider.tsx](/C:/Github_sync/trading-stack/neon-stock-terminal/apps/web/src/i18n/LocaleProvider.tsx)
- [glossary-rules.md](/C:/Github_sync/trading-stack/neon-stock-terminal/docs/i18n/glossary-rules.md)

## Current state

Implemented now:

- locale provider with language + digits composition
- localStorage persistence
- Firebase profile preference sync
- lazy-loaded dictionaries
- glossary protection
- shared formatter layer
- root document language/digit attributes
- global language and digits control in the shell
- Devanagari-capable font stack

Partially rolled out:

- many dashboard pages already use the shared formatter and translation layer
- shell/navigation/shared UI are localized
- several market/backtesting pages were migrated

Still incomplete:

- not every page has been fully migrated off direct `toLocaleString()` / `toLocaleTimeString()` calls
- some pages still contain hardcoded English copy or direct date formatting
- debug/inspection panels are not yet fully aligned with the formatter layer

Known remaining rollout gaps from the current source scan include:

- [AnalyticsSetupsPage.tsx](/C:/Github_sync/trading-stack/neon-stock-terminal/apps/web/src/pages/AnalyticsSetupsPage.tsx)
- [AnalyticsRiskPage.tsx](/C:/Github_sync/trading-stack/neon-stock-terminal/apps/web/src/pages/AnalyticsRiskPage.tsx)
- [AnalyticsRegimePage.tsx](/C:/Github_sync/trading-stack/neon-stock-terminal/apps/web/src/pages/AnalyticsRegimePage.tsx)
- [AnalyticsIndicatorsPage.tsx](/C:/Github_sync/trading-stack/neon-stock-terminal/apps/web/src/pages/AnalyticsIndicatorsPage.tsx)
- [BacktestingRegimeAnalysisPage.tsx](/C:/Github_sync/trading-stack/neon-stock-terminal/apps/web/src/pages/BacktestingRegimeAnalysisPage.tsx)
- [IndicatorEducationBlocks.tsx](/C:/Github_sync/trading-stack/neon-stock-terminal/apps/web/src/components/indicators/IndicatorEducationBlocks.tsx)
- [PerformanceDebugPanel.tsx](/C:/Github_sync/trading-stack/neon-stock-terminal/apps/web/src/analytics/PerformanceDebugPanel.tsx)
- [useIndicatorAnalytics.tsx](/C:/Github_sync/trading-stack/neon-stock-terminal/apps/web/src/analytics/useIndicatorAnalytics.tsx)

The architecture is in place. The remaining work is page-by-page rollout and QA, not a redesign of the i18n system.

## Testing guidance

Minimum verification matrix:

- English + Latin digits
- Hindi + Latin digits
- Hindi + Devanagari digits
- Marathi + Latin digits
- Marathi + Devanagari digits

Check on both desktop and mobile:

- page titles and subtitles
- helper text and warnings
- chart titles and axis labels
- legend labels
- table headers
- tooltip formatting
- finance tokens staying in English
- no clipped Devanagari text
- numeric alignment in dense tables/charts

Recommended smoke routes:

- `/`
- `/analytics`
- `/analytics/regime`
- `/options`
- `/analytics/simulator`
- `/analytics/indicators`
- `/backtesting`
- `/backtesting/compare`

## Future rollout guidance

When migrating a page:

1. Replace direct literals with `t(...)` or `tr(...)`.
2. Replace direct `toLocaleString` / `Intl.DateTimeFormat` calls with shared formatters.
3. Keep finance glossary tokens in English.
4. Test in Hindi and Marathi with both digit modes.
5. Verify no layout clipping in Devanagari.
