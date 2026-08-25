# Paper Trading P&L Accounting and Target Scenarios

Audit time: 12 August 2026, 17:06 UTC (22:36 IST)

## Correct accounting definitions

- Realised gross is the sum of immutable `pnl_ledger` entries with `entry_kind = REALISED_GROSS`.
- Realised after costs and tax is the sum of `positions.realised_pnl` and is shown separately.
- Open unrealised gross is the direction-normalised cash-equity mark on remaining quantity: long `(mark-entry)*qty`; short `(entry-mark)*qty`.
- Gross execution mark is `realised gross + open unrealised gross`. It is the only combined figure now shown because both terms use a gross basis.
- A net combined liquidation value is intentionally not shown until exit costs and tax on open positions can be estimated on the same basis.

The previous UI combined realised after costs/tax with gross unrealised P&L. That was a mixed-basis figure and has been removed.

## Target-exit scenarios

The dashboard calculates three comparable counterfactual gross portfolios. For each trade it chooses the first hit of the matching intraday or swing target. A trade without a matching hit remains marked at the latest cash-equity price using its full F&O-lot-sized share quantity.

| Scenario | Intraday target | Swing target |
|---|---:|---:|
| Low | +0.30% | +1.00% |
| Medium | +0.50% | +3.00% |
| High | +1.00% | +5.00% |

Each card separately shows scenario realised gross, scenario unrealised gross, combined gross, target-exit count and marked count. These scenario values are analytical; they never rewrite booked fills or ledger P&L.

## Governed actual paper exit

New OIIS and manual paper trades close on the first of:

- intraday +1.00%; or
- swing +3.00%.

The paper monitor uses the next executable bar/fill model, then books costs and tax. Existing open groups were migrated to the same policy. Historical closes and ledger entries were not changed. Analytical D+5 and D+30 observation continues after execution closes.

## Maximum opportunity and pain

- 30D maximum favourable potential is the sum of `entry notional * max(MFE_30D, 0)`.
- 30D maximum observed pain is the sum of `entry notional * abs(min(MAE_30D, 0))`.

These values are path extrema, not realised or unrealised accounting. Developing trades represent evidence observed so far within their still-open 30-session windows.

## Weekly comparison

The weekly chart plots cumulative realised gross plus the latest open unrealised gross on the primary rupee axis. NIFTY 50 is plotted on the secondary percentage axis, rebased to the first displayed week. Current-week NIFTY uses the canonical `public.bars_1m` index token; completed weeks use `strategy_eval.nifty50_daily_regime`.

## Validation

- API TypeScript build: passed.
- Web TypeScript/Vite production build: passed.
- Paper projection/scenario unit tests: 6 passed.
- Production Playwright regression: 44/44 passed at desktop, tablet and mobile.
- Live services healthy: dashboard, PostgreSQL, paper API/workers, OIIS and collector.
- Screenshots: `output/playwright/paper-pnl-reconciliation/`.
