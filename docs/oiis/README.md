# OIIS research integration

This folder is the operator and engineering entry point for the OIIS Phase-A
cash-daily research implementation. OIIS separates data readiness, directional
opportunity (OFactor), execution quality (XFactor), hard gates and outcomes.

The current version is a deterministic three-year stored-session replay for the
current Nifty 100 panel. It is not the complete intraday/options/live framework
described by the source package, and it contains no broker-order capability.

Start with `OIIS_OPERATOR_RUNBOOK.md` and
`OIIS_CANONICAL_FORMULA_DECISION_REGISTER.md`.
