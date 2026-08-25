# Stock F&O Funnel and NIFTY Weekly Options

Date: 2026-08-13

## Finding: why the stock Long Options page showed five underlyings

The five rows were not the available F&O universe. They were the final governed live shortlist produced by the existing movement pipeline:

| Stage | Latest observed count | Meaning |
|---|---:|---|
| Effective stock F&O universe requested | 186 | All eligible stock F&O underlyings supplied to the pre-market run |
| Pre-market evaluated | 185 | Underlyings with enough source evidence to evaluate |
| Pre-market shortlist | 15 | Names retained for live re-evaluation |
| Live evaluated | 15 | Names checked with the live policy |
| Live shortlist | 5 | Final movement candidates sent to option-structure evaluation |

The UI and `GET /v1/long-options/summary` now expose all funnel stages. The page explicitly states that five is a shortlist rather than the complete F&O universe. The existing governed 186 → 15 → 5 policy was not widened silently.

## New independent strategy

Strategy ID: `NIFTY_WEEKLY_LONG_OPTIONS`

Dashboard: `/n50/strategy/nifty-weekly-options`

API: `GET /n50/v1/nifty-weekly-options/summary`

This strategy is independent from:

- OIIS;
- Rolling Monthly;
- the stock Long Options router;
- Paper Trading;
- live broker execution.

It selects the nearest future NIFTY weekly expiry from persisted option-chain data and evaluates:

1. BUY ATM straddle;
2. BUY approximately 30-delta strangle.

Entry economics use ask prices. Mark/exit economics use bid prices. Premium risk uses one effective NIFTY option lot read from `public.instruments`. The dashboard shows the complete stored strike ladder with bid, ask, implied volatility, delta, volume and open interest.

The same strategy response now includes exchange-native OI evidence from the canonical watcher:

- CE and PE OI totals for the persisted ATM strike window;
- put/call OI ratio;
- CE/PE day OI change and net OI change;
- highest call-OI and put-OI walls with their OI change;
- comparison with the nearest same-session snapshot at least ten minutes earlier;
- per-strike OI, OI change and volume.

These values are context for the weekly derivatives strategy, not a new entry rule. They do not
remove `SHADOW_NO_TRADE` or the target-probability calibration veto. The UI states that the totals
cover the persisted ATM window and does not mislabel them as complete exchange-chain totals.

## Current data reconciliation

At implementation time the canonical database contained:

- nearest NIFTY weekly expiry: 2026-08-18;
- NIFTY spot: 24,395.85;
- ATM strike: 24,400;
- effective option lot size: 65;
- 13 strikes / 26 option legs;
- 26 of 26 legs with positive bid and ask.

These are database observations, not UI fixtures.

## Safety state

The weekly strategy remains `SHADOW_NO_TRADE`. A 20-session log-return volatility proxy is displayed as descriptive movement evidence, but it is not a calibrated target-hit probability. `TARGET_PROBABILITY_NOT_CALIBRATED` is therefore a mandatory veto. No paper or live order action is rendered.

Promotion requires a separate point-in-time backtest/calibration of executable bid outcomes after spread, charges and expiry/session effects. Until that evidence exists, the correct decision is `NO_TRADE`.

## Verification

- API TypeScript typecheck: passed.
- Web TypeScript typecheck: passed.
- Long Options and NIFTY Weekly unit tests: 9 passed, 0 failed.
- Playwright desktop/mobile evidence is stored under `output/playwright/nifty-weekly-options/` after deployment validation.

## Rollback

Remove the new strategy route registration, page, command entry and API route. The change adds no tables or migrations and does not alter OIIS, Rolling Monthly, Paper Trading or broker-order code paths.
