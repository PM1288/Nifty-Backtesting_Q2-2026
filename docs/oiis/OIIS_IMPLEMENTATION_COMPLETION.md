# OIIS implementation completion

Phase A cash-daily research baseline is implemented. It includes versioned
configuration, numeric DQ, independent LONG/SHORT OFactor, supported daily setup
detection, XFactor, hard-gate precedence, next-session entries followed by the
programme-wide target-only outcome contract,
complete stock/index/VIX mapping, PostgreSQL persistence, consolidated reports,
checksums, a full-run safety guard and deterministic tests.

Formula V1.1 is governed as `OPPORTUNITY_SCAN / NOT_RANKABLE / NR` because its
approved comparative mandate has target-only exits and may retain unresolved
positions indefinitely. Current
panel survivorship and missing chronological out-of-sample/independent evidence
must not be hidden by the successful pipeline result.

OIIS V1.0 full-run evidence is retained as audit history but is marked
`SUPERSEDED_EXIT_POLICY`; its structural-stop/2R/ten-session exits are not
compatible with the shared I030-then-S100 mandate. See
`../common-exit-contract/README.md` for the governing specification.

Phases B–E from the source package remain intentionally incomplete: dedicated
OIIS API/UI/P-Diagram pages, empirical calibration/walk-forward, point-in-time
options/carry and paper/shadow operation. See `OIIS_LIMITATIONS.md`.
