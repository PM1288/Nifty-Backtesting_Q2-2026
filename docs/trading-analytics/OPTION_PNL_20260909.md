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
