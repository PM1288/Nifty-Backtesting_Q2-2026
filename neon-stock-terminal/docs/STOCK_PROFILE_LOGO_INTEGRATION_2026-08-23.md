# Stock profile, logo and strategy-impact integration

## Source audit

- Source master: `/home/novius2/NIFTY50/Stock-details-and-logos/NIFTY_250_FO_Structured_Stock_Master_2026-08-23.json`
- Logo archive: `/home/novius2/NIFTY50/Stock-details-and-logos/NIFTY_LargeMidCap_250_and_NSE_FO_Company_Logos_2026-08-22.zip`
- Archive integrity: PASS (`unzip -tq`)
- Records/symbols/logos: 268 / 268 / 268
- Cap buckets: 100 Large Cap, 150 Mid Cap, 18 Small Cap
- Sectors: 19
- “NIFTY 250” is displayed as the official source classification `NIFTY LargeMidcap 250`.

## Architecture

- `public.instrument_profiles` is an additive display/classification table. It is not a trading-permission source.
- SVGs and their SHA-256 values are retained in PostgreSQL. The generated profile snapshot embeds base64 SVG data URLs, avoiding a burst of per-logo requests and gateway rate limiting on dense boards.
- `/v1/instrument-profiles` and `/v1/instrument-profiles/{symbol}/logo.svg` expose the canonical backend model.
- The web profile file is generated deterministically from the same master by `scripts/build-stock-profile-assets.mjs`.
- Shared controls implement universe, cap and sector filtering, stock identity, logos and a distribution summary.

## UI coverage

- Home market canvas: logo per stock, sticky filters and distribution summary.
- Stock 360: company identity and logo above the stock header.
- Paper Trading: persistent filters, stock-mix summary, logo/symbol in parallel evidence, and offline interactive HTML export.
- OIIS Live, Rolling Monthly and Long Options: shared filters and stock-mix summary. NIFTY Weekly Options remains explicitly index-only; stock-cap filtering is not falsely applied to an index contract.

## Interactive HTML snapshot

The Paper parallel plot exports one self-contained HTML document with embedded records, axes, CSS and JavaScript. It works offline and retains stock search, strategy filtering, outcome colour selection and hover/focus inspection. The browser caches one snapshot per 16:00 IST cut-off day so repeated downloads do not rebuild it. A new snapshot is prepared on first download after the next cut-off. This is a lazy daily cache, not a background server job; a future server artifact scheduler can make generation independent of user access.

## Rollback

Revert the web/API files and redeploy the prior dashboard image. The additive table can remain unused without affecting collectors or calculations. If removal is approved later: `drop table public.instrument_profiles`; this is not required for application rollback.
