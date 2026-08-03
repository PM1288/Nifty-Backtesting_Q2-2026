# Configuration

All market, expiry, fee, and strategy rules are effective-dated inputs. The files
here are examples and test fixtures until reconciled against authoritative exchange
notices and broker contract notes. Never infer historical rules from today's values.

`strategies/rsi_1m_daily45_v1.yml` is the immutable single-symbol reference for
the requested rule: enter after completed 1-minute RSI(14) is below 30 only when
the prior completed session's daily RSI(14) is above 45; exit after completed
1-minute RSI(14) is above 70. Entries and exits occur at the next minute open.

`strategies/daily_rising_oversold_intraday_v1.yml` adds the new multi-timeframe
setup. The previous completed daily RSI(14) must be below 30 and above each of
the two daily RSI values before it; the next session open must exceed that prior
close. A completed 1-minute bar between 09:30 and 12:00 IST must then have
RSI(14) below 25, Williams %R below -80, and its low above the 20-period,
two-standard-deviation lower Bollinger band. It emits at the next minute open;
the existing target/exit policy remains simulator-owned and the manifest records
the unchanged 1.25% target assumption.

`programme.runtime.example.yml` provides the non-secret V2.0 programme paths and
safety defaults. Database credentials remain environment variables. Full-estate
execution is disabled until the documented data and owner gates are accepted.

`research/nifty_atm_long_straddle_v1.yml` specifies the requested NIFTY call-plus-put
research experiment. It remains research-only and blocked until observed, timestamped
historical premiums and point-in-time contract rules pass
`tools/audit_derivatives_readiness.py`; current lot-size web pages are not historical evidence.
