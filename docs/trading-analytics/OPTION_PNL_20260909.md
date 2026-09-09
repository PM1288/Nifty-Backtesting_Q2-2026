# MANEESH observation high/low and option P&L

User-authorised read-only hypothetical analysis. Inspect → Overview opens underlying,
CE and PE entry/high/low/latest values, 15m/30m/EOD window, quantity and gross/charges/net.
Default one lot, individually resolved for each exact CE/PE token + symbol + expiry
from NFO instrument master. Master timestamp exposed. This is current master metadata,
not a backdated lot-size claim; absent metadata yields unavailable P&L. No order path.

Delta means exit minus entry PREMIUM (not Greek Delta). Quantity = lots × lot size.
Underlying remains point context; equity/index prices do not receive option taxation.
CE and PE are independent long-option scenarios; simultaneous highs are not summed.
High/low are stored post-entry excursions within the chosen horizon, not fill claims.

## Charges

Verified https://zerodha.com/brokerage-calculator/ and its public
https://zerodha.com/static/js/brokerage.js `cal_options` on 2026-09-09.
Policy `ZERODHA_NSE_OPTIONS_CALCULATOR_20260909`: ₹20 each buy and sell;
STT sell premium 0.15%, rounded rupee; NSE transaction 0.03503% + IPFT 0.0005%
on both premiums (each rounded paise); SEBI 0.0001%; GST 18% of brokerage,
transaction/IPFT and SEBI; buy stamp 0.003%, rounded rupee. Each component and
net rounded as the calculator. Zero exit retains two explicit assumed orders;
unlike the calculator's zero-as-missing-input shortcut it does not remove a leg.
No slippage, impact, income tax, auto-square-off or expiry/physical-settlement model.
Current policy is applied as a what-if, not historical rate reconstruction.
The general charges page's IPFT text differs from calculator JS; use the requested
calculator's explicit component rates, not both interpretations added together.

## Exact Scalper navigation

Link carries symbol, expiry/chartExpiry, strike, interval, observation day,
CE/PE symbols and tokens. Exact mode disables expiry/ATM auto-roll and day fallback.
The returned chart pair must match both identities/tokens or a visible unavailable
state replaces the charts. No current ATM pair is silently substituted.

No strategy rules, signal generation, fills, ingestion, accounting ledger, permission
or WhatsApp behavior changed. Raw evidence/exports retain every prior field; additive
lot-size fields are included automatically in full exports. Calculation breakdown
is visible in the inspector. Tests: `optionPnl.test.ts`, web/API suites and deployed
`trade-log-option-pnl.mjs`. Release evidence recorded after deployment.

## Release and live evidence — 2026-09-09

- Runtime source: `6243d0a`, merged and pushed to `master`.
- Existing Compose project: `trading-stack-novius2`; dashboard healthy after rebuild.
- Image: `sha256:47b3b13f9d7c56477241dba7ac893df002b6309f58b56c22ea5328536c7bb96f`.
- Public bundle: `index-CDvh3wwg.js`.
- Rollback image retained: `trading-stack-n50-dashboard:pre-option-pnl-20260909`.
- Web: 108 tests passed; API: 190 tests passed; both typechecks/builds passed.
- New live feature checks: 10/10, including inspector axe, mobile overflow,
  quantity changes, exact CE/PE response identity, date/strike and no JS errors.
- Existing live regression: 34/34, including all presets, full filtered JSON exact
  row parity, responsive/axe checks, Escape/focus return, URL restoration and
  observation availability when the unrelated market-context request fails.
  Evidence: `output/playwright/trade-log-pnl-regression/`.
- Live sample: NHPC29SEP2676CE/PE; respective exact tokens 131833/131840;
  master lot size 6,950. Two-lot CE 15-minute high scenario: entry 2.00,
  high 2.15, quantity 13,900, gross ₹2,085, charges ₹117.46, net ₹1,967.54.
  This is hypothetical, not a realised trade or guaranteed executable high.
- Existing NFO master checks also covered AXISBANK (625) and LAURUSLABS (850).
  No claim that every underlying had an eligible live observation during this run.
- Evidence: `output/playwright/trade-log-option-pnl/results.json`,
  `chart-identity.json`, `high-pnl-1440.png`, `pnl-390.png`,
  `exact-scalper-1440.png`.
- Initial browser-test failures waited for headings hidden at compact viewport
  widths; tests now wait for the visible workbench/control. Runtime functionality
  was verified independently via exact chart-response identities.

Reproduce (existing protected local admin credential is read by the harness;
never print it):

```bash
cd /home/novius2/trading-stack
node tools/playwright/trade-log-option-pnl.mjs
PLAYWRIGHT_BASE_URL=https://n50.nifty50today.co.in/n50 PLAYWRIGHT_OUTPUT_DIR=output/playwright/trade-log-pnl-regression node tools/playwright/trade-log-readability.mjs
```

Deployment used only the existing dashboard deployment script:

```bash
PUBLIC_BASE_URL=https://n50.nifty50today.co.in ROUTE_PATH='/n50/strategy/trading-analytics?view=trade-log' bash scripts/deploy_n50_dashboard.sh
```

No database migration, broker order, paper order or WhatsApp message was issued.
