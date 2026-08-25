# Backtest method

The bootstrap consumes immutable source decisions, never reconstructed current features. `source_max_event_time <= as_of` is enforced by a database constraint and validation query. Candidate outcomes are evaluated in a second pass using later trading-session bars. Actionable, developing, no-chase and rejected rows are all retained. Current v0 outcome coverage is D+1..D+5 daily plus MFE/MAE; intraday 15/30/60 timing and target-order chronology remain a documented extension rather than being inferred from daily bars.
