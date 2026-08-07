# Contract and implementation decisions

## Independent timelines

One immutable entry path feeds three different views:

1. D0 ladder: observe 0.3%, 0.5% and 0.7% without stopping observation.
2. D+5 ladder: observe 1%, 2%, 5% and every adverse rung without stopping.
3. H30: observe all 30 eligible sessions D0..D+29 using canonical daily close.

The actual execution scenario may sell at intraday 0.3%, or later at swing 1%,
but this cannot truncate either evidence path. For the RELIANCE acceptance the
execution sold at I030 on D0, the D+5 path still recorded every reward rung,
and H30 found its maximum on D+27. This is the required separation.

## H30 calculation

- Primary maximum: maximum canonical official daily `close_price`, not the
  minute high and not the daily high.
- Tie: earliest eligible session.
- Coverage: 30 rows is mature; sequential partial history is right-censored;
  an internal gap is a data gap; detected corporate-action discontinuity is
  blocked. Missing rows are never forward-filled.
- Stored variants: inclusive D0 maximum, post-D0 maximum, D+1..D+5 maximum,
  D+29 return, and giveback from maximum to D+29.
- Risk/time: low-based MAE before maximum, full-window MAE, underwater count
  and longest streak, recovery session, sessions/calendar days to maximum,
  capital-days, profit per capital-day and opportunity-to-MAE ratio.
- Comparisons: NIFTY 50 return to the stock's maximum date and an equal-weight
  sector proxy. The proxy is disclosed and blocks final ranking.
- Economics: ₹2 lakh ticket, effective D0 intraday/D1+ delivery cost profiles,
  and a 35% reserve only on positive pre-tax hypothetical profit. Current 8/22
  bps figures are explicitly non-certified proxy costs and block final ranking.

## Ranking

`H30_PRACTICALITY` is a separate league from realised execution P&L. Its six
components use a weighted geometric diagnostic score: upside depth, band-hit
breadth, speed, downside efficiency, consistency and NIFTY alpha.

Final publication is blocked unless there are at least 100 mature entries,
90% mature coverage, certified benchmarks/corporate-action/cost policies,
determinism, compatible policy identities, no future-label leakage, at least
two years, and acceptable symbol/month concentration. A diagnostic score can
remain visible while the final score is null.

## Non-contamination rules

- H30 outcomes are never entry features or eligibility gates.
- Strategy modules define entry only; they do not modify the shared exit.
- H30 cannot rewrite realised P&L, exit time, capital release or path hash.
- H30 and P&L leaderboards must not be combined into one oracle rank.
