# Trading Analytics v1 — integration decision

Source review: 2026-09-07. Branch starts at `26d2343`.

Implement an independent read-only workspace at `/strategy/trading-analytics`.
Existing OIIS, OISS and NIFTY options strategies remain unchanged. Reuse the
authenticated Node API, PostgreSQL, React Query and ECharts. The Go collector
remains the SmartAPI session owner; NSE watcher remains NIFTY chain authority.

Verified existing sources: `market_data.nse_fii_derivatives_stats`,
`market_data.nse_fii_participant_open_interest`, institutional-flow cash adapter,
`option_chain_snapshots`, `option_chain_legs`, `bars_1d`, `instruments` and
`trading_calendar`. Existing FII tables currently end on 2026-03-30; this is a
real freshness gap, not evidence of a current morning report. The Python FII
service already owns XLS/CSV parsing and scheduled retrieval; extend it rather
than adding a broker login or duplicate service.

Source folder: `/home/novius2/NIFTY50/The_Nifty_Options_stragty-2`.
Read implementation prompt, story specification, source audit and golden JSON;
PowerPoint contains ten slides. Original DOCX and dated participant CSV are not
in this folder. Workbook has a different filename but is present. Golden data
is acceptance evidence, never a substitute for runtime observations.

Important parser finding: existing XLS whitelist omits several index products
and CSV parser assumes an unquoted/unpadded header. Correct these with regression
tests, preserving source values. Immutable import provenance belongs in additive
tables; imported workbook yearless blocks must not be assigned guessed dates.

Execution disabled. Preview rules cannot create paper or broker orders. Unknown
publication times remain unknown. Source discrepancies, stale observations,
unapproved lookbacks, put interpretation and absent sizing/exits remain blockers.
Use exact decimal arithmetic for source amounts and distinct legacy projections.

Public references checked: SmartAPI portals return an authorization page; official
Python SDK exposes candles/OI/quotes/Greeks/PCR and SNAP_QUOTE. This verifies the
interface, not this account's full historical coverage. NSE CAS page and circular
FAOP75472 are the schedule references; do not change shared calendar semantics
without an independently tested date-effective implementation.

Rollback is route/navigation removal and disabling this module, not deletion of
source observations. No database source values or prior strategy rules are replaced.
