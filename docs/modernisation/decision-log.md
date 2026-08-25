# Modernisation decision log

## 2026-08-23 — Handover authority

`CODEX_PROMPT_NIFTY50_FULL_SYSTEM_MODERNISATION_V3.md` is authoritative. The critical review supplies rationale and the prioritised backlog supplies item IDs. Existing working calculations and data remain canonical unless a reproducible defect proves otherwise.

## 2026-08-23 — Preserve dirty worktree

The source mirror contains extensive uncommitted implementation work. No reset, cleanup, bulk replacement, or unrelated formatting is permitted. Changes are narrow and additive.

## 2026-08-23 — Futures serialization defect

Approved correction: cast/normalise `expiry_rank` from PostgreSQL bigint to a JSON-safe number. This does not change financial calculations or contract meaning. Regression test and authenticated runtime proof are required and passed.

## 2026-08-23 — Paper migration order

Do not hide monolithic Paper latency with skeletons. First implement progressive authenticated contracts/read models and prove their budgets; then migrate Overview, Trade Evidence and Inspector. `/v1` stays available for parity.
