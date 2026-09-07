# Scalper chart preferences and resistance overlays

Branch `ui/scalper-5m-levels-20260907`. Scope: Trading Analytics charts only; no orders, collector changes or database writes.

- Missing/invalid Scalper interval now defaults to 5 minutes. Explicit 15/60 selections remain supported.
- One-day view defaults to the latest retained NIFTY session, labelled by IST date. Other retained sessions and all-days view are selectable in URL state. Filtering is presentation-only: EMA still uses full source history and CSV exports keep all retained bars.
- Rising candles green, falling candles red in Scalper and Market Structure. NIFTY alone has a toggle for 50-point grid spacing; option axes remain independent.
- Monthly/weekly/daily resistance overlays reuse the existing backend `levels` engine: bearish open, largest bearish body then recency, later completed same-timeframe close strictly above breaks resistance, no resurrection and equality is a touch. Selected R must be above the as-of NIFTY price. Origin, full candidate set, break evidence, lookback and state are inspectable.
- Monthly lookback: 12 completed months, as documented. Daily/weekly counts are intentionally unset until chosen in the UI or supplied as `dailyLookback` / `weeklyLookback` query parameters. They are not hidden trading defaults. Test requests use 20/12 explicitly, without persisting production settings.
- All levels are **PREVIEW / UNAPPROVED**, not approved recommendations. Insufficient retained bars and unconfigured lookbacks display explicit states. Original revisions and session completeness remain uncertified. Daily eligibility uses the conservative IST calendar-day end; weekly/monthly use the next period boundary. Forming periods cannot establish levels. Resistance reflects the page as-of snapshot, not a claim of historical availability merely because a past chart day is selected.

Source policy: `The_Nifty_Options_stragty-2/Trading_Analytics_Story_and_Implementation_20260907_v1_0.md`, section 8.1. The source does not specify weekly/daily counts and contains conflicting ranking descriptions; this release does not silently approve one for trading.

Validation and deployment evidence will be appended after the checks finish. Reversible by reverting this scoped change and rebuilding only `n50-dashboard` from pushed master; no migration rollback is needed.
