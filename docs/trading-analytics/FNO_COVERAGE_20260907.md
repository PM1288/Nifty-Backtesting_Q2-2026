# Trading Analytics: index and F&O stock coverage

## Review and changes

The former workspace was hard-coded to NIFTY spot token 99926000 / OPTIDX.
The API default was 15m although Scalper's frontend default was 5m. Price & EMA
also had an independent 15m default. Stock-chain snapshots already existed but
were not consumed here.

This change adds an underlying selector from the canonical NSE instrument master:
NIFTY-named indices and NSE underlyings with current NFO OPTIDX/OPTSTK contracts.
No synthetic symbol list, guessed tokens or BFO/MCX instruments are introduced.
Indices without options can still show their available price evidence; option
coverage is explicitly missing, not manufactured.

`symbol=` is shared by the main API, charts, Scalper, Price & EMA, daily/weekly/
monthly candles, resistance preview, expiries, exact CE/PE contracts, quotes,
Greeks and full JSON. Changing underlying clears expiry, strike, pin and selected
day; other lens/context settings remain. Unsupported stocks never fall back to
NIFTY. Current master as-of filtering is preserved; this is not a versioned
historical-universe claim.

All chart defaults are 5m. Price & EMA now respects the shared URL interval.
Scalper retains latest-observed one-day default, red/green candles, EMA warm-up
and visible partial/missing-bar states. Exact-option OI sampling follows selected
5/15/60m interval. The optional 50-point grid defaults on only for NIFTY; other
underlyings use automatic price scaling.

## Options and missingness

Existing FULL quotes remain the primary source. When their paired-window OI is
incomplete, read one latest `smartapi_option_chain_snapshots` cohort for the
selected underlying/expiry within seven days. Never merge cohorts or providers
leg by leg. Partial FULL quotes remain visible. A complete separate cohort supplies
metrics with its own source, strike count, timestamp and exported `metricLegs`;
only entirely absent FULL OI permits the whole quote table to use the cohort.
Its source and individual quote times remain exposed. Midpoint is
exported as midpoint, never relabelled as last-traded price. No new broker session,
poller or option collector was added. Missing option-minute history stays missing.

Every Trading Analytics lens now shows a shared selected-underlying metrics
strip: OI PCR, volume PCR and **indicative window max pain**. The original strict
verified-unit max-pain field remains unchanged.

Window estimate = argmin over observed paired strikes of sum[OI × intrinsic
value]. Requires complete nonnegative OI, complete CE/PE pairs, positive total OI
and equal positive lot sizes. All tied minimizing strikes are retained. A common
positive units/lot multiplier does not affect argmin; however common provider
units are an explicit assumption, not a newly verified fact. Missing/inconsistent
inputs produce DATA_INSUFFICIENT. This is NOT full-chain max pain or a rupee
payout prediction. PCR uses only the named observed window, not the entire exchange.

Source documentation: [SmartAPI](https://smartapi.angelbroking.com/docs) documents
FULL quotes, OI and depth; [NSE option chain](https://www.nseindia.com/option-chain?symbol=stock_name)
identifies its own OI/volume as contracts. This does not certify SmartAPI unit
normalization or complete exchange-chain coverage.

## Strategy status / limitations

This remains a read-only research preview. Existing EMA9 SMA seed, closed-bar
checks, exact-option own-series EMA and resistance rules are preserved. Daily/
weekly lookback approval, entry/exit/risk and executable strategy acceptance are
still incomplete. No BUY/SELL, paper intent, WhatsApp output or live broker order
was enabled. Aggregate institutional flows remain market-wide, not stock-specific.
Phase-comparable stock turnover/delivery is still unavailable.

Do not describe the full strategy as production-executable, full-chain coverage as
complete, or every listed master instrument as having available minute history.

## Validation and operation

API/web typechecks, unit tests and builds; canonical repository gate; focused
public Playwright harness `tools/playwright/trading-analytics-fno-coverage.mjs`.
The harness checks NIFTY, BANKNIFTY, RELIANCE and SBIN independently, records actual
coverage, selection/reset, default 5m/day, desktop/mobile overflow and axe evidence.
Runtime results are recorded after deployment, not inferred from unit fixtures.

Route `/n50/strategy/trading-analytics?view=scalper&symbol=RELIANCE`.
Feature flag remains `N50_TRADING_ANALYTICS_ENABLED`; only the dashboard container
needs rebuilding/recreating from pushed master. No SQL migration. Rollback to
the previous dashboard image; preserved raw data and unrelated services unchanged.
