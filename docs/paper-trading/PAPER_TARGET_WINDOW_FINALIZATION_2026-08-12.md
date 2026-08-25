# Paper target-window finalisation

Executed: 2026-08-12 19:03 UTC / 2026-08-13 00:33 IST

## Governing lifecycle

- Intraday targets are eligible only from the paper fill through the official close of the entry session (D0).
- An intraday target that is not hit by D0 close becomes `NOT_HIT_INTRADAY`, displayed as `FAILED`. It must not remain pending on a later date.
- Swing targets remain `ACTIVE`, displayed as `PENDING`, throughout the 30-trading-session observation window.
- A swing target that is not hit after 30 observed trading sessions becomes `TIMED_OUT`, displayed as `FAILED`.
- Closing the simulated execution does not stop the analytical observation window.
- A target already hit is immutable for ordinary finalisation.
- A higher target proves that every lower target in the same lifecycle was crossed. Legacy lower targets added after the crossing are reconciled as `CLOSED_AT_TARGET` with `result_kind=INFERRED_MONOTONIC`.

## Implementation

- Migration: `services/paper_trading/migrations/007_target_window_finalization.sql`
- Scheduled finaliser: `services/paper_trading/src/papertrade/scheduler.py`
- UI state and matrix summary: `neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx`
- Visual state: `neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.module.css`
- Runtime regression: `tools/playwright/paper-trading-regression.mjs`

The daily paper scheduler invokes the finaliser before the daily summary. PostgreSQL advisory locking protects the operation from duplicate scheduler replicas.

## Live reconciliation result

After migration and service deployment:

| Lifecycle | Persisted status | Count |
|---|---|---:|
| Intraday | `CLOSED_AT_TARGET` | 15 |
| Intraday | `NOT_HIT_INTRADAY` | 17 |
| Swing | `ACTIVE` | 23 |
| Swing | `CLOSED_AT_TARGET` | 1 |

Integrity checks:

- Overdue active intraday targets: **0**
- Swing targets timed out before 30 observed sessions: **0**
- Higher-target/lower-target monotonicity violations: **0**

## Validation evidence

- Python migration/domain/webhook suite: **13 passed**
- Ruff: **passed**
- Mypy: **passed**
- Production TypeScript and Vite build: **passed**
- Live Playwright paper-trading regression: **60/60 passed**
- Screenshots and JSON evidence: `output/playwright/paper-target-finalization/`
- Dashboard route: `https://n50.nifty50today.co.in/n50/paper-trading`

The live LTM fixture is explicitly asserted to show four failed intraday targets and three pending swing targets.

## Recovery

The pre-change data-only backup is:

`/home/novius2/backups/paper-target-window-20260812/paper-target-window.dump`

Rollback should disable the scheduled finaliser and forward-fix statuses from the backup if required. Do not destructively reverse migration history in production.
