# Entry and Exit Contract

## Entry ownership

Every strategy owns only the entry decision: required indicators, completed-bar
condition, regime filters, time window, direction, ranking score and the point
at which the intent becomes available. The execution model then determines the
buy price, normally the next executable minute open. No exit rule embedded in
an entry narrative may override this document unless a separately versioned
programme is explicitly approved.

## Executable long-equity exit state machine

`P0` is the original filled buy price and never changes.

1. `PENDING_ENTRY`: signal accepted but not yet filled.
2. `INTRADAY_OPEN`: entry filled. Active target is the tick-rounded-up value of
   `P0 × 1.003` for the remainder of the entry session, including the entry bar.
3. `CLOSED_INTRADAY`: if a bar opens above the target, fill at the bar open; if
   its high reaches the target, fill at the target. Capital is then released.
4. `SWING_OPEN`: if I030 was not filled before the entry session ended, active
   target becomes the tick-rounded-up value of `P0 × 1.01` from the first bar
   of the next trading session. It remains based on P0.
5. `CLOSED_SWING`: apply the same gap-open then high-touch execution ordering at
   S100. Capital is released only here.
6. `OPEN_AS_OF_END`: if S100 has not filled when source data ends, do not create
   a sale. Keep the position and capital occupied, and report its estimated
   net-liquidation value separately.

## Explicitly forbidden exit triggers

- structural or percentage stop-loss;
- RSI, Williams %R, Bollinger, moving-average or other indicator reversal;
- same-session forced close;
- maximum bars, D+5, ten-session or other timeout;
- portfolio drawdown/risk shutdown as a synthetic historical fill;
- end-of-run sale;
- later hindsight recovery substituted for the actual recorded state.

Risk controls may reject a new entry before it opens. They may not rewrite the
shared post-entry historical exit path.

## Multiple targets

The Rules-of-Engagement ladders serve two different purposes:

| Ladder | Levels | Role |
|---|---|---|
| Actual intraday exit | I030 | Sell target during entry session |
| Intraday evaluation | I030, I050, I070 | Compare entry-session opportunity |
| Actual swing exit | S100 | Sell target after intraday miss |
| Swing evaluation | S100, S200, S500 | Compare subsequent path opportunity |
| Adverse evaluation | A050, A100, A200, A500, A1000, below A1000 | Measure risk only |

Target-event timestamps are observed only up to the actual exit or the end of
available data. Levels reached after capital was already released are not
claimed as executable fills for that trade.
