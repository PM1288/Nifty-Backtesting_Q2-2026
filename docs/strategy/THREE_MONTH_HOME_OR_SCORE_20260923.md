# 3Month Home Bull/Bear OR-group scoring

Date: 23 September 2026  
Branch: `fix/home-three-month-or-score-20260923`

## Corrected contract

The Home Bull and Bear screeners now present the historical reversal condition
first and in the requested order:

`M-3 OR M-2 OR M-1`

Those three comparisons are one logical group and contribute at most one point.
The other ten comparisons remain independently scored:

- two Month conditions;
- two Week conditions;
- two Day conditions;
- two 1-hour conditions;
- two 15-minute conditions.

The visible score is therefore `passed / 11`, not `/10` and not `/13`.

For Bull, the historical group passes when any retained M-3, M-2 or M-1 candle
has `close < open`. For Bear it passes when any one has `close > open`. A pass
resolves the OR group even if a different historical month is unavailable. If
none passes, the group fails only when all three comparisons are available and
fail; otherwise it remains unavailable. Missing evidence is never converted to
zero.

Qualification is unchanged: the historical OR group and every one of the ten
current timeframe comparisons must pass. The API retains the legacy raw gate
counts and adds `scoredConditionCount`, `availableConditionCount` and
`totalConditionCount` so consumers can distinguish raw comparisons from the
grouped score.

## Surfaces

- Home Bull and Bear tables show M-3/M-2/M-1 together before the current
  timeframe columns and rank by the grouped score.
- The row inspector explains that the group is worth one point and retains the
  exact open/close arithmetic for all three months.
- The full 3Month Strategy screen and CSV use the same grouped score and order.
- The trading shortlist remains qualification-based; no order, alert, entry,
  exit, position-size or backtest rule changed.

## Validation

Automated tests cover fully qualified Bull and Bear cases, all-history failure,
fully missing history, and a partially missing history group resolved by one
passing month. The authenticated browser regression checks the API score
invariant, both Home directions, M-3/M-2/M-1 order, `/11` scoring, exact
arithmetic drawer and CSV export.

Rerun:

```bash
cd /home/novius2/trading-stack
npm --prefix neon-stock-terminal/apps/web run typecheck
npm --prefix neon-stock-terminal/apps/web test
npm --prefix neon-stock-terminal/apps/web run build
npm --prefix neon-stock-terminal/apps/api run typecheck
npm --prefix neon-stock-terminal/apps/api test
npm --prefix neon-stock-terminal/apps/api run build
bash scripts/verify/canonical-repository-gate.sh
PLAYWRIGHT_OUTPUT_DIR=/home/novius2/NIFTY50/evidence/three-month-home-or-score-20260923 \
  node tools/playwright/three-month-strategy-regression.mjs
```
