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
  `absolute_monthly_open_bullish_long_v1` for that month.

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
