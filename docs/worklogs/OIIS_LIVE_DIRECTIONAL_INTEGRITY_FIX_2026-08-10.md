# OIIS Live Directional Integrity Fix — 10 August 2026

## Purpose

This change corrects the 10 August OIIS Live calculation without changing the authoritative paper-trade exit contract. It separates directional opportunity discovery from long-only pullback execution permission and preserves every legacy V2 run as immutable evidence. Policy 3.3 is authoritative. It supersedes short-lived validation releases 3.0–3.2: 3.0 exposed an unscoped pre-open fallback query, 3.1 did not persist an execution-readiness rank for rejected rows, and 3.2 used a ten-row review cut that hid SHRIRAMFIN at opportunity rank 11. Their rows are retained as failed-release evidence and are not authoritative.

## Confirmed pre-fix evidence

The deployed service and PostgreSQL rows confirmed the reported defects:

| Symbol | Persisted direction | O | X | Persisted volume | Old extension |
|---|---:|---:|---:|---:|---:|
| TITAN | LONG | 70.4126 | 28.3205 | 0 | 3.0162 |
| SHRIRAMFIN | LONG | 64.3306 | 16.8990 | 0 | 2.4016 |
| GRASIM | LONG | 61.2798 | 27.0708 | 0 | 2.9873 |
| SBIN | LONG | 54.5436 | 35.7697 | 155177 | 1.4834 |

The three scheduled V2 rows were physically executed after market close and reused the same effective snapshot. Their immutable rows remain in PostgreSQL for audit.

The source minute table contained only a partial 10 August session for the four named stocks, ending around 11:55 IST. TITAN, SHRIRAMFIN and GRASIM had zero accumulated source volume. That evidence is incomplete; it is not legitimate evidence of zero market participation.

## Corrected decision model

### Universe

The eligible scanner universe is now:

```text
active NIFTY 50 membership INTERSECTION active F&O underlying eligibility
```

The union remains visible only as inactive inventory metadata. Every evaluated V3 row must have both flags true.

### Time semantics

`decision_as_of` and `execution_timestamp` are stored separately.

| Slot | Decision cutoff in Asia/Kolkata |
|---|---:|
| PREOPEN_0830 | 08:30 |
| OPEN_0930 | 09:30 |
| AFTERNOON_1500 | 15:00 |

Historical or delayed execution does not move the decision cutoff. All minute queries use a strict upper cutoff and completed-bar semantics. A manual historical run defaults to 15:30 IST unless an explicit valid cutoff is supplied.

### Semantic intraday-data permission

For an intraday snapshot, `FULL` permission requires:

```text
actual bars / expected completed bars >= 0.95
latest included bar no more than 2 minutes behind the cutoff
cumulative cash-equity volume > 0
session data status = FULL
```

Missing or incomplete volume remains `NULL`/`DATA_INSUFFICIENT`; it is never converted into participation of zero while retaining FULL data quality. An incomplete intraday snapshot caps the data-quality score below permission level.

### Extension

The old formula was removed:

```text
abs(current close - SMA20) / ATR14
```

V3 uses:

```text
MoveATR = abs(current session price - session open) / previous completed daily ATR14
VWAPDistanceATR = abs(current session price - session VWAP) / previous completed daily ATR14
```

The blocking exhaustion limit is `MoveATR > 1.80`. The expected regression values are:

| Symbol | Correct MoveATR |
|---|---:|
| TITAN | 1.6294 |
| SHRIRAMFIN | 0.6971 |
| GRASIM | 0.7598 |
| SBIN | 1.6995 |

### Direction

The model now stores:

- `structural_direction`: the multi-session OFactor structure;
- `session_direction`: the current-session price/VWAP/gap/close-location result;
- `direction`: the resolved actionable direction;
- `direction_state`: aligned, counter-trend or structural-only context.

A sufficiently strong current-session direction overrides stale structural direction for the actionable label. SBIN can therefore retain a LONG structural bias while resolving to `SHORT / COUNTER_TREND_SHORT` for 10 August.

### Opportunity versus execution

The system now exposes two independent orders:

1. `opportunity_rank` uses selected OFactor and the component-quality evidence. Blocking-failure count cannot hide a strong directional opportunity. The review surface retains the first 15 rows so all three diagnosed bullish names remain visible on 10 August; this does not grant entry permission.
2. `execution_rank` uses data permission, canonical OFactor permission, XFactor and gate readiness.

The full scanner publishes LONG and SHORT opportunities. The existing daily long-pullback execution policy remains separate and may only create paper-entry permission for LONG rows.

OFactor 54 and 64 are retained as LOW and MEDIUM research cohorts. Canonical trade permission remains 74. XFactor permission remains 76.

### One canonical setup

The OIIS core produces one immutable `SetupEvaluation`. XFactor and hard gates consume the same object. A row cannot be both `TRIGGERED` and `NO_VALID_SETUP`.

### Stop and reward/risk

SMA20 is no longer substituted when a valid setup has no structural invalidation. Reward/risk is not fixed to 2.0. Without a canonical setup stop and a real opposing barrier:

```text
structural_stop = NOT_CALCULATED
reward_risk = NOT_CALCULATED
reason = REWARD_RISK_NOT_CALCULATED
```

## Persistence changes

Additive migration `034_oiis_live_directional_integrity.sql` adds:

- run-level decision cutoff, physical execution timestamp, requested universe and counts;
- structural/session/resolved direction evidence;
- opportunity and execution ranks;
- bar coverage and canonical setup identity/state;
- indexes and an extended current-watchlist view.

No table, row, legacy run or applied migration is deleted.

## UI and API changes

The dashboard now reports canonical O>=74 separately from O>=54 research screening, describes the corrected MoveATR/VWAP formula, shows semantic bar coverage, displays structural/session/resolved direction together and orders the evidence table by opportunity rank. Universe counts distinguish the eligible intersection from the F&O and NIFTY 50 source lists.

## Verification requirements

- additive migration succeeds on a disposable PostgreSQL database;
- one canonical setup result feeds XFactor and gates;
- exact MoveATR regression values pass;
- zero/incomplete intraday volume cannot receive FULL permission;
- SBIN resolves as current-session bearish while its structural bias may remain bullish;
- Python OIIS tests, TypeScript checks and production frontend build pass;
- deployed V3 run records exact slot cutoffs and preserves V2 rows;
- UI/API/database values reconcile for the corrected run.

## Known evidence limitations

- The captured SmartAPI cash minute data for the named stocks is incomplete on 10 August. V3 fails closed and still surfaces directional opportunity evidence, but cannot manufacture reliable live-volume confirmation.
- Point-in-time historical NIFTY 50 membership remains limited by the membership source available in PostgreSQL. The run records the source/hash so this limitation is visible.
- Immediate futures price/OI confirmation is not fabricated when no valid point-in-time derivative snapshot exists.
