# Monthly and Rolling Strategy Rerun — 24 August 2026

## Scope

The monthly strategy family and independent rolling-window strategy were rerun after the 268-stock NIFTY LargeMidcap 250 plus F&O cash universe and daily data were refreshed. No strategy formula, threshold, entry rule, exit rule or API contract was changed.

## Commands executed

The production `rolling-monthly` service was used for:

```text
backfill-expiry --months 36
backfill-absolute --months 36
backfill-absolute-first-session --months 36
backfill-rolling --months 36
run
```

The deployed image initially lacked the checked-in `backfill-rolling` command. The current repository image was rebuilt, its complete focused test suite passed, and the rolling backfill was then executed from the corrected image. The production daemon was replaced with that image after the backfill committed.

## Results

### Current governed monthly scanner

| Field | Value |
|---|---:|
| Latest signal date | 21 August 2026 |
| Entry date | 24 August 2026 |
| Source maximum date | 24 August 2026 |
| Universe | 268 |
| Long scanner candidates | 20 |
| Short scanner candidates | 27 |
| Total candidates | 47 |

The latest run completed at `2026-08-24 05:20:38 UTC`.

### Expiry-month history

| Field | Value |
|---|---:|
| Completed expiry months | 36 |
| Range | August 2023–July 2026 |
| Candidate records | 1,885 |

Completed historical expiry months are immutable and idempotent. The rerun found no later completed August expiry cohort to add, so existing historical identities and timestamps remained unchanged.

### Absolute monthly closure

| Field | Value |
|---|---:|
| Months | 36 |
| Range | September 2023–August 2026 |
| Symbol-month evaluations | 8,892 |
| Qualifying entries | 1,114 |
| Latest source date | 24 August 2026 |

Current August state:

- Universe evaluated: 268/268.
- Incomplete symbols: 0.
- Qualified: 40.
- Maturity: `DEVELOPING`.
- Current observed average return: -1.0100%; no August path is month-end complete yet.

### Absolute first-session variant

| Field | Value |
|---|---:|
| Months | 36 |
| Range | September 2023–August 2026 |
| Symbol-month evaluations | 8,870 |
| Eligible setups | 672 |
| Threshold scenarios | 1,344 |
| Entered scenarios | 1,258 |

Current August state:

- Universe evaluated: 268/268.
- Incomplete symbols: 0.
- Eligible setups: 33.
- Threshold scenarios: 66.
- Entered scenarios: 52.
- Maturity: `DEVELOPING`.
- Current average return for entered scenarios: +0.2139%.

### Rolling 5/30/60 strategy

| Field | Value |
|---|---:|
| Strategy version | `rolling_5_30_60_bullish_long_v1` |
| Window | Three years |
| Source end date | 24 August 2026 |
| Universe | 268 |
| Candidate records | 5,073 |
| First signal | 24 August 2023 |
| Latest signal | 21 August 2026 |
| Average observed end return | +5.5561% |
| Reached +1% | 4,636 |
| Reached +3% | 3,942 |
| Reached +5% | 3,345 |

These aggregate hit counts include developing and mature records according to the existing canonical strategy rules; downstream UI must retain maturity labels and must not present an incomplete path as a completed outcome.

## Validation

- Rolling-monthly focused suite: 22/22 passed.
- New production daemon: healthy, zero restarts.
- `backfill-rolling` is present in the deployed command registry.
- Database source-end dates reconcile to 24 August 2026 for current, absolute-month, first-session and rolling outputs.
- Both August monthly variants evaluated all 268 symbols with zero incomplete symbols.
- Dashboard service remained healthy throughout.
- Existing auth enforcement on dashboard APIs remains unchanged.

## Rollback

The prior stopped container is retained temporarily as:

```text
trading-stack-novius2-rolling-monthly-pre-command-20260824
```

It can be inspected or restored if required. The new daemon uses the same database schema and contracts; no database rollback is required.
