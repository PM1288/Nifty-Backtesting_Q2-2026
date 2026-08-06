# Target, Risk and Regime Evaluation

Every accepted entry must produce evidence even when it never closes.

## Target evidence

For I030, I050, I070, S100, S200 and S500 record the raw and tick-rounded target,
first touch time, first executable opportunity, fill status, elapsed minutes,
elapsed sessions, MFE/MAE before the event and path ambiguity. I-levels are
restricted to the entry session. S-levels begin on the next trading session.

Report resolution checkpoints at intraday close and D+1 through D+5. D+5
unresolved is a serious target-time and capital-lock failure, but it is not an
exit under the approved mandate. Continue observing the position until S100 or
the data boundary.

## Risk evidence without stop exits

Record first touches of -0.50%, -1.00%, -2.00%, -5.00%, -10.00% and below
-10.00%; maximum adverse excursion; maximum favourable excursion; time
underwater; longest underwater streak; recovery time; capital lock sessions;
and capital-days. Every adverse event must carry `exit_triggered=false`.

The absence of a stop does not make downside disappear. Open losses and capital
traps must be visible beside realised profits. A strategy with a 100% closed
trade win rate may still be poor when unresolved positions have large negative
net-liquidation value.

## Regime context

Attach point-in-time stock, NIFTY 50, Bank NIFTY and India VIX regimes to the
signal and outcome. Evaluate at least stock/NIFTY trend, market zone,
volatility, sector, event window, month, year, target stage, adverse band and
holding band. Market/event labels learned after the trade may be used for
post-trade slicing only, never to create a historical entry.

## Comparability

Two strategies may be compared only if their exit-policy ID, target ladders,
tick rule, cost profile, tax policy, source coverage, universe, execution model
and capital scenario match. Entry rules may differ; that is what the comparison
is intended to measure.

Target-only results remain `NOT_RANKABLE` under the generic Rules taxonomy
until complete open-position, capital, benchmark, cost, reproducibility and
out-of-sample gates pass. The UI must show both closed-book P&L and total
net-liquidation outcome.
