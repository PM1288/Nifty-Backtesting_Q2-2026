# OIIS implementation completion

Phase A cash-daily research baseline is implemented. It includes versioned
configuration, numeric DQ, independent LONG/SHORT OFactor, supported daily setup
detection, XFactor, hard-gate precedence, next-session controlled outcomes,
complete stock/index/VIX mapping, PostgreSQL persistence, consolidated reports,
checksums, a full-run safety guard and deterministic tests.

The run is governed as `TRUE_BACKTEST_ISOLATED / NOT_RANKABLE / NR`. Current
panel survivorship and missing chronological out-of-sample/independent evidence
must not be hidden by the successful pipeline result.

Phases B–E from the source package remain intentionally incomplete: dedicated
OIIS API/UI/P-Diagram pages, empirical calibration/walk-forward, point-in-time
options/carry and paper/shadow operation. See `OIIS_LIMITATIONS.md`.
