# OISS implementation specification

The implementation preserves all 31 required sections in `oiss.run.sections.contract_sections`. Each stock has a complete immutable score snapshot, status, Why, Missing confirmation, Upgrade condition and Invalidation. `NONE`, `NO TRADE` and `DATA INSUFFICIENT` are explicit states.

Operating modes are BACKFILL, BACKTEST, INTELLIGENCE, PAPER, ASSISTED and LIVE_CANDIDATE. Only backfill/backtest/intelligence are active during initial validation. No real broker-order path exists.

Source scan identity is the existing official OIIS cadence: 09:30, every 30 minutes through 15:00 IST. OISS `as_of` is the later of the scheduled decision timestamp and immutable source snapshot availability, preventing processing latency from being represented as earlier knowledge.
