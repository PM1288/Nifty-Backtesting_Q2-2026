# NIFTY OI watcher incident — 8 September 2026

## Finding

The separate `option-chain-watcher` was not removed or stopped. It successfully
polled the official NSE NIFTY option chain every two minutes during the 7
September session and stored both W0 and M0 snapshots. Each stored snapshot had
26 ATM-window legs with open interest and exchange-provided change in OI.

At 06:01 IST on Tuesday, 8 September, its cleanup deleted all 1,291 retained
snapshots. The code ignored `NSE_OC_CLEANUP_MIN_DAYS=14` and instead deleted
everything earlier than the start of the latest Tuesday. Consequently:

- container health remained `ok=true` because the process and database worked;
- `lastStoredAt` still referred to 7 September;
- `GET /option-chain/api/latest` returned `No snapshots yet`;
- the dashboard/API had no NSE-watcher OI/change-in-OI rows until the next open
  session could repopulate them.

The deleted rows are not recoverable from the live option-chain tables. No
synthetic reconstruction was attempted.

## Correction

- Cleanup now uses an actual IST age boundary:
  `start_of_today_IST - NSE_OC_CLEANUP_MIN_DAYS`.
- Cleanup is due at most once per IST calendar day inside the configured window.
- The source default and protected production setting are now 30 days, matching
  the approved option-history retention objective.
- The misleading Tuesday-boundary implementation and log text were removed.
- Expiry-selection tests now use an explicit as-of date instead of the machine's
  current date.

## Validation

- Option-chain watcher build: pass.
- Node tests: 8 passed, 0 failed.
- New boundaries: 30 days, 14 days and minimum one-day guard verified.
- Daily cleanup due/not-due behavior verified across IST dates.
- Canonical repository gate and diff check: pass.
- No option, paper or broker order was submitted.

## Runtime evidence before rollout

```text
Container: healthy
Last successful poll/store: 2026-09-07T10:09:43Z
Current session state: SUPPRESSED / BEFORE_MARKET_OPEN
Deleted by faulty cleanup: 1,291 snapshots
Current latest endpoint: No snapshots yet
```

After rollout, collection will resume automatically when the trading calendar
enters the 8 September market session. Acceptance requires a new stored snapshot,
non-empty latest API response and non-null OI/change-in-OI rows.

