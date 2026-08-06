# OIIS canonical formula decision register

Status: research baseline frozen; owner/quant production approval pending.

The Markdown, DOCX, CSV, ZIP contents and both diagrams in `TEST-OISS` were
reviewed. The ZIP passed integrity testing and its duplicate DOCX, Markdown and
CSV match the standalone files byte-for-byte.

| ID | Research V1 decision | Compatibility and reason |
|---|---|---|
| CAN-001 | Nine OFactor components weighted 8/14/18/10/18/12/10/6/4 | Uses the detailed OFactor document. Eleven-component starter remains `LEGACY_DRAFT_V0` only. |
| CAN-002 | Nine XFactor components weighted 18/20/16/14/14/6/6/3/3 | Uses the detailed XFactor document. Ten-component starter is not runtime truth. |
| CAN-003 | OFactor qualified 74, Tier A 82; XFactor Tier B 76, Tier A 84 | Frozen for `OIIS-CASH-DAILY-RESEARCH-V1.0`; other horizons require new versions. |
| CAN-004 | DQ = 35% coverage + 30% freshness + 20% consistency + 15% source reliability | DQ remains separate and can block scoring. A score is never multiplied by DQ. |
| CAN-005 | Options blocked | Conflicting option units cannot affect the cash research replay. Resolve by product, expiry and provider before Phase D. |
| CAN-006 | ₹16L/₹2L/max-eight and 22 bps/35% tax are research assumptions only | Existing platform mandate reused. This is not owner approval for live risk or execution. |

Atomic mappings are implemented in `nifty_stratlab.oiis.engine`; configuration
is `config/oiis/formulas/oiis_cash_daily_research_v1.json`. Missing catalyst
history receives a neutral component, never a positive claim. Delivery and
OHLCV are labelled participation proxies, never confirmed institutional flow.

Supported Phase-A setups are `BREAKOUT_ACCEPTANCE`, `BREAKDOWN_ACCEPTANCE` and
directional `PULLBACK_CONTINUATION`. The remaining documented intraday setups
are explicitly deferred rather than represented by invented daily proxies.
