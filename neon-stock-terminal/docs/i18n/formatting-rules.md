# Formatting Rules

This document defines the shared formatting rules for localized dashboards.

## Locale composition

The app combines language and digit system into a single Intl locale string using the numbering-system extension:

- `en-IN-u-nu-latn`
- `hi-IN-u-nu-latn`
- `hi-IN-u-nu-deva`
- `mr-IN-u-nu-latn`
- `mr-IN-u-nu-deva`

This is the source of truth for numeric and date formatting.

## Shared formatter functions

The implemented formatter layer is in:

- [format.ts](/C:/Github_sync/trading-stack/neon-stock-terminal/apps/web/src/lib/format.ts)

Use these functions instead of direct `toLocaleString(...)` or ad hoc `Intl.DateTimeFormat(...)` calls:

- `formatNumber()`
- `formatCurrencyINR()`
- `formatPercent()`
- `formatDateTime()`
- `formatCompactCurrency()`
- `formatCompactIN()`
- `formatTime()`

Compatibility aliases also exist:

- `formatNumberIN()`
- `formatDateIST()`

## Number formatting rules

Use `formatNumber()` for:

- counts
- ranks
- quantities
- non-currency metrics

Examples:

- item counts
- signal counts
- sample size
- open positions count

## Currency formatting rules

Use `formatCurrencyINR()` for rupee-denominated values:

- invested amount
- current value
- realized P&L
- unrealized P&L
- charges
- stock prices
- cash balance
- capital deployed

Use `formatCompactCurrency()` when the UI is space-constrained:

- KPI cards
- compact chart tooltips
- small summary rows

Do not use the rupee formatter for:

- RSI
- MACD
- WILLR
- IV
- PCR
- trade counts
- win rate
- drawdown percentages
- index points unless the metric is explicitly INR-denominated

## Percent formatting rules

Use `formatPercent()` for:

- returns
- win rate
- drawdown
- change percentages
- benchmark delta percentages

The current helper supports:

- configurable decimals
- signed output

## Date and time rules

Use:

- `formatDateTime(value)`
- `formatDateTime(value, { includeTime: true })`
- `formatTime(value)`

Current timezone default:

- `Asia/Kolkata`

Current public style from the formatter:

- date: `10 Mar 2026`
- date + time: `10 Mar 2026, 18:57 IST`
- time only: `18:57`

Do not use:

- raw `Date.toLocaleString()` in page components
- raw `Date.toLocaleTimeString()` in page components
- manually assembled date formats unless there is a strict product need

## Chart formatting rules

Charts should use the shared formatter layer for:

- axis labels
- tooltip values
- legend numeric labels where applicable
- compact summary values

Chart copy should translate:

- chart title
- subtitle/helper text
- x-axis title
- y-axis title
- legend labels

Charts should not localize:

- ticker symbols
- protected indicator abbreviations
- glossary-protected finance terms

## Table formatting rules

Tables should use:

- `formatNumber()` for counts and generic metrics
- `formatCurrencyINR()` for rupee values
- `formatPercent()` for percentage metrics
- `formatDateTime()` or `formatTime()` for timestamps

Dense numeric tables should keep tabular numerals. Current CSS support for this is in:

- [global.css](/C:/Github_sync/trading-stack/neon-stock-terminal/apps/web/src/styles/global.css)
- [tokens.css](/C:/Github_sync/trading-stack/neon-stock-terminal/apps/web/src/styles/tokens.css)

## Digit-system rules

Language and digits are independent.

Valid combinations:

- English UI + Latin digits
- Hindi UI + Latin digits
- Hindi UI + Devanagari digits
- Marathi UI + Latin digits
- Marathi UI + Devanagari digits

Recommendation for finance-dense pages:

- Hindi/Marathi UI with Latin digits is often easier to scan for traders
- Devanagari digits remain available as an explicit preference

## Current rollout status

The formatter architecture is implemented and active globally.

Visible page-level number, currency, percent, and date formatting should now route through:

- [format.ts](/C:/Github_sync/trading-stack/neon-stock-terminal/apps/web/src/lib/format.ts)

The remaining `toFixed(...)` uses in the web app are intentionally internal and non-display:

- animation alpha values
- chart gradient strings
- analytics timing/sanitization payloads
- internal numeric bucketing before formatted display
