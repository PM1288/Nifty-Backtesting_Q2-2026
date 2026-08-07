# OIIS low-trade diagnosis — full H30 run

Run: `3f6695e6-e55f-4d12-a672-9208039558e9`  
Range: 2016-01-01 to 2026-08-05  
Universe: 99 symbols  
Source: `outputs/oiis_cash_daily_research_v1/3f6695e6-e55f-4d12-a672-9208039558e9`

## Executive answer

The strategy evaluated 121,316 daily decisions and produced 32 enterable
signals (0.0264%). The common execution adapter created 27 paths (0.0223%).
Therefore the low result is primarily an **entry-gate problem**, with a second
independent **minute-data coverage problem**.

The shared exit did not reduce the entry count. It only determined how the 27
accepted paths closed. H30 observation also does not reject entries or alter
exits.

## Primary decision outcomes

These are mutually exclusive primary decision codes, so they explain the full
121,316 rows:

| Primary outcome | Rows | Share |
|---|---:|---:|
| `NO_OPPORTUNITY` | 104,622 | 86.24% |
| `DO_NOT_CHASE` | 12,136 | 10.00% |
| `DATA_INSUFFICIENT` | 2,901 | 2.39% |
| `REJECT_POOR_RR` | 1,281 | 1.06% |
| `SETUP_FORMING` | 119 | 0.10% |
| `WAIT` | 111 | 0.09% |
| `REJECT_LIQUIDITY` | 92 | 0.08% |
| `ENTERABLE_TIER_B` | 22 | 0.018% |
| `ENTERABLE_TIER_A` | 10 | 0.008% |
| `WATCHLIST` | 16 | 0.013% |
| `REJECT_STOP_INVALID` | 4 | 0.003% |
| `WAIT_FOR_TRIGGER` | 2 | 0.002% |

`NO_OPPORTUNITY` is the dominant primary reason. It includes OFactor below
74 and directional edge below 8. The next largest primary reason is
`DO_NOT_CHASE`, caused by extension beyond 1.5 ATR from the 20-day mean.

## Gate counts (overlapping, not additive)

Each decision can have multiple hard gates, so these counts must not be summed:

| Gate | Rows | Share of all decisions |
|---|---:|---:|
| `OFACTOR_BELOW_MINIMUM` | 107,295 | 88.44% |
| `NO_VALID_SETUP` | 101,770 | 83.89% |
| `REWARD_RISK_BELOW_MINIMUM` | 57,785 | 47.63% |
| `INSUFFICIENT_LIQUIDITY` | 54,263 | 44.73% |
| `EXCESSIVE_EXTENSION` | 42,261 | 34.84% |
| `DIRECTIONAL_EDGE_BELOW_MINIMUM` | 21,037 | 17.34% |
| `STOP_TOO_WIDE` | 15,988 | 13.18% |
| `STALE_OR_INSUFFICIENT_MARKET_DATA` | 4,851 | 4.00% |
| `TRIGGER_CONFIRMATION_MISSING` | 2,964 | 2.44% |

The largest structural bottleneck is the conjunction of a valid setup and an
OFactor score of at least 74. Only 16,582 rows had a triggered setup; 101,770
rows were still `FORMING`. Of the detected setups, 11,450 were pullback
continuation, 5,282 breakout acceptance and 2,814 breakdown acceptance.

## Why 32 became 27 executable paths

All 32 enterable signals were LONG and had an empty hard-gate list. Five could
not be executed because minute evidence was unavailable for the requested
entry date:

- `M&M` — no minute CSV.
- `MAXHEALTH` — no minute CSV.
- `PFC` on 2026-05-08 — CSV ends 2025-08-06.
- `SHRIRAMFIN` on 2026-05-06 — CSV ends 2025-08-06.
- `VEDL` on 2026-04-27 — CSV ends 2025-08-06.

The existing `missing_minute_symbols.csv` reports only absent files, not
symbols whose file exists but ends before the entry date. Thus the run summary
lists two missing symbols even though five enterable signals were skipped.
This is a reporting limitation, not a fabricated trade.

## What is not causing the low count

- The common exit is not filtering entry signals.
- The H30 scan is not stopping at 0.3%, 1% or any ladder rung.
- Tax, fees and target exits are applied after acceptance and cannot explain
  the small signal count.
- The 35% tax reserve affects hypothetical/realised economics, not eligibility.
- Liquidity and stop gates matter, but their primary decision counts are much
  smaller than the OFactor/setup bottleneck.

## Safe interpretation and next action

The current 0.0223% path rate is expected from a deliberately strict research
contract. Do not relax every threshold at once. The evidence supports two
separate experiments:

1. Extend/import minute data through the EOD period before judging 2026 signals.
2. Run a controlled entry sensitivity matrix: keep exits/H30 identical and
   test OFactor 74→70, directional edge 8→6, and setup/trigger rules one at a
   time. Re-run the full ladder and H30 reports for each version.

The diagnostic workbook is
`oiis_diagnostic_review.xlsx` in the run folder. Its `DecisionCodes`,
`GateFailures`, `NearThreshold`, `SymbolFrequency`, `Trades` and
`RegimePerformance` sheets are the review starting point.
