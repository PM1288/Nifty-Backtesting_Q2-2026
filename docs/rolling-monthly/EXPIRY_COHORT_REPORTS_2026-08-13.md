# Rolling Monthly expiry cohort reports

## Outcome

The standalone Rolling Monthly dashboard now exposes the latest three expiry cohorts as separate month-year tabs. As of 13 August 2026 these are July 2026, June 2026 and May 2026.

This remains research-only and independent from OIIS, Paper Trading and broker execution.

## Cohort definition

- Signal anchor: the configured last-Tuesday monthly expiry close.
- Entry: the next valid NSE session open using the cash-equity underlying.
- Evaluation end: the following monthly expiry close.
- Latest unfinished cohort: evaluated only through the latest available daily bar and labelled `DEVELOPING`.
- LONG return: `100 × (observed price / entry price - 1)`.
- SHORT return: `100 × (1 - observed price / entry price)`.
- Maximum profit: maximum direction-normalized favourable high/low excursion inside the cohort window.
- Maximum drawdown: minimum direction-normalized adverse high/low excursion inside the cohort window, displayed as a negative percentage.

## Qualification semantics

The report includes every stock that passed all six base scanner conditions at the signal close. It separately shows whether the V2 quality model marked that match entry-eligible. This avoids incorrectly hiding scanner matches merely because the later quality filter rejected them.

## Portfolio summaries

Each cohort reports:

- base-scanner match count;
- quality-eligible count;
- LONG and SHORT counts;
- winners and losers at the evaluation end;
- unweighted average direction-normalized return;
- average winning return;
- average losing return;
- average maximum favourable move;
- average maximum drawdown.

Only rows with valid observed prices contribute to return averages. Missing observations remain unavailable rather than becoming zero.

## Verified production results

Production reconciliation on 13 August 2026 produced:

| Cohort | Window status | Scanner matches | Winners / losers | Average expiry P/L | Average winner | Average loser | Average max profit | Average max drawdown |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| July 2026 | Developing through 12 Aug toward 25 Aug expiry | 52 | 23 / 29 | -1.15% | +3.30% | -4.67% | +3.18% | -4.89% |
| June 2026 | Matured at 28 Jul expiry | 45 | 18 / 27 | -0.77% | +8.20% | -6.75% | +5.87% | -7.07% |
| May 2026 | Matured at 30 Jun expiry | 33 | 19 / 14 | -1.54% | +4.38% | -9.56% | +6.11% | -7.93% |

The two fully matured cohorts have a combined, trade-weighted average expiry P/L of approximately **-1.09%**. Including the still-developing July cohort gives a provisional three-cohort average of approximately **-1.12%**. These figures describe every six-condition base-scanner match; none passed the separate V2 quality eligibility gate in these three cohorts.

## Data and safety

- Source: canonical `public.bars_1d`, `rolling_monthly.expiry_run`, `rolling_monthly.run` and `rolling_monthly.candidate` records.
- The daily history was checked for the previously reported June–July market-session gap before this report was enabled.
- Values are calculated at full database precision and rounded to two decimals only for display.
- No paper trade or live broker order is created.

## Application route

`/n50/strategy/rolling-monthly?view=expiry`

The selected month is shareable through the `cohort=YYYY-MM-01` query parameter.

Clicking a stock symbol opens a contextual weekly candlestick view. Weekly OHLCV is aggregated on
the backend from canonical daily bars; purple vertical markers identify each calendar-month
transition. The dialog also shows the cohort signal expiry, following expiry, volume and a link to
the complete Stock 360 view.
