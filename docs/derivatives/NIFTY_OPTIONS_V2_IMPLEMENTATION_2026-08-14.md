# NIFTY Options V2 implementation record

Date: 14 August 2026
Production route: `https://n50.nifty50today.co.in/n50/strategy/nifty-options`
Compatibility route: `/n50/strategy/nifty-weekly-options`
Safety state: `SHADOW_NO_TRADE`

## Package reviewed

The implementation was reconciled against every supplied artefact under:

`/home/novius2/NIFTY50/Niftyoptiknv2`

This included the Codex prompt, standalone HTML reference, architecture Markdown/DOCX, API contract, additive schema template, policy, charge calculator/example, validation summary, event samples and n8n export. The standalone HTML was used as an interaction and information-hierarchy reference; it was not embedded in the React application.

## Critical interpretation

The package does not provide enough retained history to truthfully produce calibrated DQS/MRS/LCS/DES/VES/CQS/ECS/TFS/FRS values or a target-hit probability. The dashboard therefore shows `— / Not calibrated`, rather than inventing scores. Paper submission and live orders remain disabled. This is consistent with the architecture's promotion gates and is release-critical trading safety, not an unfinished cosmetic state.

The supplied migration is explicitly a template that requires repository reconciliation. It was not applied because there are no calibrated evaluations or promoted paper groups to persist yet. Existing Paper Trading tables, routes, calculations, webhook and workers were not changed.

## Implemented

### Collector

- Extended the existing NSE option-chain watcher to resolve and collect:
  - `W0`: nearest NIFTY expiry;
  - `M0`: last expiry in the front available contract month.
- One contract-info request resolves both roles, followed by one chain request per distinct expiry every configured 120 seconds during a valid exchange session.
- If `W0 == M0`, the physical expiry is fetched/stored once.
- Unchanged-snapshot suppression now compares within the same expiry, preventing cross-expiry dedupe errors.
- Existing exchange-calendar session suppression remains intact; there is no overnight persistence and no new SmartAPI/broker connection.

Production evidence after deployment:

```text
W0 2026-08-18: 13 strikes / 26 legs
M0 2026-08-25: 13 strikes / 26 legs
Lot size: 65 from the effective SmartAPI NFO instrument master
```

### API

Added authenticated, read-only endpoints:

```text
GET /n50/v1/nifty-options/summary
GET /n50/v1/nifty-options/expiries
```

The legacy weekly endpoint remains available. The new summary returns:

- effective W0/M0 registry and same-expiry dedupe state;
- independent weekly and monthly snapshots;
- one-lot movement/structure economics;
- NSE OI/PCR/wall/change evidence per surface;
- strict long-premium safety state;
- explicit uncalibrated scorecard;
- isolated empty Paper Book state;
- retained-history/promotion-gate status;
- source authority and wiring state.

All prices, percentages and scores are rendered with no more than two decimal places. Missing values remain `—`.

### React dashboard

The Strategy menu now exposes **NIFTY Options** at the canonical route. The page has all six requested route-addressable views:

1. Command Centre
2. Weekly
3. Monthly
4. Chain & Surface
5. Paper Book
6. Validation & Health

The page includes W0/M0 context, actual expiries, NIFTY spot, lot size, two-sided coverage, OI walls, ATM-window PCR, 10-minute OI comparison, candidate long-premium structures, bid/ask economics, premium risk, forecast/implied ratio, ₹1,000 net target bid, source matrix, promotion thresholds and safety explanations.

The Strategy hover menu, workspace sub-navigation, command-search catalogue and legacy deep link were updated. No OIIS, Rolling Monthly or stock Long Options calculation was merged into this strategy.

## Verification

Commands:

```bash
cd /home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/services/option-chain-watcher
npm test

cd /home/novius2/trading-stack/neon-stock-terminal/apps/api
npx prisma generate
npm run typecheck
npm test

cd /home/novius2/trading-stack/neon-stock-terminal/apps/web
npm run typecheck
npm test
npm run build
```

Results:

```text
Watcher: 6/6 passed
Dashboard API: 84/84 passed
Web component/domain tests: 21/21 passed
Production build: passed
Playwright deployed checks: 53/53 passed
OpenAPI: 18 specifications valid; 576 aggregate operations; no validation errors
```

Playwright evidence:

`/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/tools/playwright/output/playwright/nifty-options-v2`

The deployed test covers desktop 1920×1080 and mobile 390×844, authenticated API access, W0/M0 identity, both real chains, lot size, long-only safety, unavailable-score semantics, isolated Paper Book, all six tabs, Strategy menu discovery, no economic action, no horizontal body overflow and console filtering.

## Deployment and rollback

Deployed services:

```text
trading-stack-novius2-option-chain-watcher-1
trading-stack-novius2-n50-dashboard-1
```

Both were healthy after deployment. Rollback requires only redeploying the previous images for those two services. No database migration or destructive data operation is involved.

## Promotion work intentionally blocked

Do not enable Paper submission until all supplied gates are actually satisfied: at least 60 forward paper sessions, 12 weekly cycles, 6 monthly cycles, 500 evaluated structures, 100 paper groups, calibrated probabilities, positive net EV after conservative costs, acceptable period stability and at least 98% data-quality pass rate. Selected-leg SmartAPI quote/depth cohorting and point-in-time replay must be implemented and validated before that promotion.
