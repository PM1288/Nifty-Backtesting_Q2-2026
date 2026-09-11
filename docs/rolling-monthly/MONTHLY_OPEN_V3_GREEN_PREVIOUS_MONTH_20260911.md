# Monthly Open v3 — previous-month green candle

Date: 11 September 2026

Strategy version: `absolute_monthly_open_bullish_long_v3`

## Authorised rule change

Monthly Open now selects the first session in each stock-month satisfying these
five eligibility conditions:

1. Two months ago close < two months ago open.
2. Previous-month close > previous-month open (green candle).
3. Signal-session open > current-week open.
4. Signal-session open > previous-week open.
5. Signal-session open > previous-session open.

The former `Previous-month open > two-month open` condition is removed. The
previous-month green-candle comparison already existed in the calculation; its
label now names both operands explicitly. Monthly Close and all other strategy
calculations are unchanged.

The change is additive and versioned. Existing
`absolute_monthly_open_bullish_long_v2` runs and candidates remain stored for
historical comparison. Candidate identifiers continue to include the strategy
version, so v3 does not overwrite v2.

## Canonical-data rerun

The revised worker was built from the current branch and run once against the
authoritative database for 36 calendar months, from October 2023 through the
developing September 2026 month. Source coverage ended 10 September 2026 and
the evaluated universe contained 268 stocks.

| Measure | Monthly Open v2 | Monthly Open v3 |
| --- | ---: | ---: |
| Candidates | 98 | 2,026 |
| Evaluable | 98 | 2,026 |
| Positive end return | 60 | 1,016 |
| Negative end return | 38 | 1,010 |
| Flat end return | 0 | 0 |
| Average end return | 3.370560% | 0.492519% |
| Average maximum profit | 9.431522% | 6.918817% |
| Worst maximum drawdown | -30.779327% | -42.741040% |
| Equal ₹100,000-per-candidate hypothetical net P/L | ₹330,314.83 | ₹997,843.36 |
| Developing September 2026 candidates | 4 | 29 |

All 98 v2 stock-month candidates are also present in v3. The removed condition
admits 1,928 additional stock-month candidates. This is the expected direct
effect of deleting a restrictive gate, but it materially reduces selectivity:
the v3 positive-end-return share is 50.15% versus 61.22% for v2. Aggregate
hypothetical rupees are not a like-for-like capital portfolio because the
calculation independently assigns ₹100,000 to every opportunity and excludes
costs and taxes.

Database reconciliation after the rerun confirmed:

- v2 remains at 36 runs and 98 candidates;
- v3 contains 36 runs and 2,026 candidates;
- v3 has zero persisted `M1_OPEN_ABOVE_M2_OPEN` evidence rows;
- each v3 candidate has five eligibility rows plus the existing informational
  entry-basis row;
- 98 v3 candidates would pass the removed gate and 1,928 would not.

## Verification and release state

- Rolling-monthly calculation tests: 28 passed in the service image, including
  a fixture where previous-month open is below two-month open but the previous
  month is green, and a fixture proving a red previous month still fails.
- Focused Ruff validation: passed.
- API: typecheck passed, 198 tests passed, production build passed.
- Web: typecheck passed, 153 tests passed, production build passed.
- Authenticated isolated candidate browser regression: 38/38 Monthly Open
  checks and 40/40 Monthly Close/Open comparison checks passed at 1440x900 and
  390x844. The current comparison contains 1,095 stock-months in both lists, 32
  Monthly Close only and 931 Monthly Open only. Runtime screenshots and result
  JSON are under `/tmp/monthly-open-v3-regression/` and
  `/tmp/monthly-open-v3-comparison/`; they are not committed market artefacts.
- Canonical repository source gate: passed.

The 36-month v3 calculations are persisted. The running production API and
worker were not replaced by this rerun; deployment remains a separate release
operation requiring the repository's release authorisation.
