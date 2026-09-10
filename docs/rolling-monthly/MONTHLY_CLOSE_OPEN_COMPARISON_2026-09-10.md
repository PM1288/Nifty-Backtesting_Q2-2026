# Monthly Close versus Monthly Open comparison

Date: 10 September 2026

Route: `/n50/strategy/monthly?compare=close-open`

## Contract

This is a read-only client comparison over the canonical persisted candidates
returned by the existing close-basis and open-basis APIs. It does not calculate
a third strategy and does not alter either selection rule.

The comparison key is `calendar month + stock symbol`:

- **In both** means the same stock was selected by both strategies for the same
  calendar month.
- **Monthly Close only** means it was selected only by
  `absolute_monthly_closure_bullish_long_v1` for that month.
- **Monthly Open only** means it was selected only by
  `absolute_monthly_open_bullish_long_v2` for that month.

The same symbol selected in different months is not a same-selection overlap.
This prevents a misleading lifetime-symbol intersection.

## Surface and preservation

The comparison includes both entry dates/prices, end returns, maximum profits,
maximum drawdowns, evaluation states and `Open - Close` end-return difference.
Each available side opens its original evidence inspector. The comparison CSV
contains independent close/open columns and keeps missing values empty rather
than coercing them to zero.

Year, calendar month, overlap class, universe, market-cap and sector filters are
available. Existing Monthly Close, Monthly Open, Expiry, First Session, unified
evidence, rejection-ledger, Stock 360 and individual export routes remain
unchanged.

## Validation

Pure comparison fixtures cover same-month overlap, different-month identity and
missing-versus-zero outcomes. The authenticated browser regression reconciles
the displayed category counts against both live API payloads, verifies filters,
CSV fields, contained table overflow, desktop/mobile rendering and absence of
failed authenticated API responses.

After the v2 recalculation, deployed data on 10 September 2026 contains 1,130
stock-month selections:

| Classification | Rows |
| --- | ---: |
| In both strategies | 95 |
| Monthly Close only | 1,032 |
| Monthly Open only | 3 |

These are live retained-data counts, not constants in the UI or test. The
deployed authenticated browser suite passed 40/40 checks at 1440x900 and
390x844, including route switching for both original strategies and CSV
download. Runtime-only screenshots/results are in
`/tmp/monthly-comparison-final-612d8d2/`.

Web typecheck/build and 144/144 tests passed. API typecheck/build and 194/194
tests passed. The canonical source gate passed. Dashboard image
`sha256:5a8809d9173391f50ce4a2e90d8551cd9fa970640cea22cd7077790666e66db8`
and rolling worker
`sha256:1f30456e839a3baf553bab548f7351e3db2f1f0248b135fa7b58d157c5958e77`
were healthy with zero restarts.

Rollback images: `trading-stack-n50-dashboard:pre-monthly-open-v2-a6cb683`
and `trading-stack-rolling-monthly:pre-monthly-open-v2-a6cb683`.
