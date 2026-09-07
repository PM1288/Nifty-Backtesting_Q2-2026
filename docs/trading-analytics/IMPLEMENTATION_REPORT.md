# Trading Analytics v1 — implementation and review

Date: 7 September 2026. Source branch: `feature/nifty-trading-analytics-20260907`.
Canonical application: `/home/novius2/trading-stack`.

## Scope and honest completion status

This release is the first tested, read-only NIFTY vertical slice, **not completion
of every Stage A–F item** in the supplied prompt. No broker or paper order API is
called. OIIS/OISS and the existing NIFTY strategy retain their identities and rules.

New route: `/n50/strategy/trading-analytics`. Strategy dropdown, command search and
the existing NIFTY Options page link to it. Lenses: Morning Brief, FII Activity,
Participant OI, NIFTY Options, Scalper / Exact Contracts, Price & EMA, History /
Replay, Policy & Data Health. URL state preserves view, report date, expiry and
as-of timestamp. Only active chart lenses mount. React Query owns shared requests;
no second polling timer or SmartAPI session is added.

## Review findings

- Read the implementation prompt, story/specification, source audit and golden
  reference; inspected workbook values and all ten PowerPoint slide annotations.
- `Then-NEW-50.docx` and the original dated participant CSV are absent. The final
  workbook participant block matches all 70 golden values, but is explicitly a
  verified **workbook** block, not a recovered original CSV. Earlier yearless
  blocks are not imported. The workbook's 2024 gap remains unresolved.
- Existing canonical FII tables stopped on 2026-03-30 before this work.
- Existing XLS parser consumed INDEX FUTURES as a header and its whitelist
  omitted several index products. It now scans data rows with no assumed header,
  supports all supplied products and rejects non-OLE/BIFF payloads. CSV header
  discovery accepts quoted/padded Client Type; malformed rows are not skipped.
- The current trading calendar already stores 2026-09-07 as 09:15–15:40 IST.
  The new aggregation takes session boundaries as inputs rather than assuming
  375 minutes. A segment-specific phase audit remains required.

## Source/API map

| Feature | Existing authority | Implementation |
|---|---|---|
| FII activity | market_data.nse_fii_derivatives_stats | Complete load revision; integer net counts; exact hundredths-of-crore subtraction; legacy and canonical signs |
| Participant OI | market_data.nse_fii_participant_open_interest | Four classes plus separate TOTAL; all original fields reachable; own-index futures long % and options proxy |
| Cash | institutional_flow.normalized_nse_fii_dii, nse_only | Same-date only; no known-at claim for legacy cash |
| NIFTY chain | option_chain_snapshots + option_chain_legs | One retained provider/expiry cohort; nearest ten paired strikes; prior snapshot delta with baseline |
| Master | instruments | Exact expiry/strike CE/PE identity; current master update cutoff prevents historical substitution |
| Candles | bars_1d, bars_1m | Completed daily EMA9 and calendar-anchored 5m/15m/1h exact-contract panes |
| Calendar | trading_calendar | Existing session boundaries; missing minute coverage never confirms a complete bar |
| Provenance | new audit.trading_analytics_artifacts | Content-addressed source copies, SHA256, actual import known-at, null publication time |
| Captured evidence | new audit.trading_analytics_evidence | Explicit CLI capture, deterministic snapshot hash, conflict-safe repeated as-of capture |

Endpoint `/v1/trading-analytics` is behind existing authentication. Endpoint
`/v1/trading-analytics/charts` reads exact instrument paths. There are no mutating
HTTP routes. Source query failures are separate explicit states, never zeros or
raw database errors. Full JSON export retains evidence and source identifiers;
source-row CSV exports include fields beyond the displayed columns.

## Formula and safety results

Independent version: `TRADING-ANALYTICS-20260907.0`.

The new tests reproduce all 16 activity net results, all four participant results,
the provisionally dated workbook adjacent-block changes and exactly five numeric
discrepancies: three integer-contract conflicts and two ₹0.01-crore precision
warnings. Counts are never repaired. Synthetic target returns, confidence and
trading profit are not generated.

EMA9: seed SMA of nine closed values, alpha 0.2. Range/body fractions are distinct,
zero range/body is null. Level preview uses completed bearish body candidates,
strict later-close breaks and no resurrection. Weekly/daily lookbacks remain
unapproved. Put confirmation must use the exact put's own EMA; approval remains
pending. 14:00 cutoff only applies to preview eligibility, not chart monitoring.

OI PCR and volume PCR are separate display-window ratios. Max-pain library
retains all minima, but **runtime max pain is withheld** because provider OI-unit
normalization and date-effective lot provenance have not been independently
verified. Full-chain coverage is not claimed from the watcher ATM window.

## Validation before release

- API: 157 tests passed, 0 failed (includes 26 new calculation and 1 HTTP safety test).
- Web: 69 tests passed, 0 failed (includes 2 export tests; updated additive navigation expectations).
- Python parser: 5 tests passed, 0 failed.
- Raw-source validation: 16 rows / 96 XLS-to-workbook fields; 5 rows / 70 workbook
  participant fields match the golden reference.
- Isolated PostgreSQL database `trading_analytics_validation_20260907`: migration
  and import ran twice; still 2 artifacts, 16 activity rows and 5 participant rows.
- API/web typechecks and local production builds passed. Canonical source gate passed.
- Pre-import real API read returned 20 option legs, 400 daily candles, no source
  query failures; old institutional data remained correctly dated March.
- Authenticated browser, post-deployment and exact-contract coverage evidence is
  recorded separately in `RELEASE_VALIDATION.md`; do not infer it from unit tests.

## Material unfinished work

1. Calendar-locked 06:00 immutable report-bundle job is not enabled. Existing FII
   scheduler retrieves on an interval; its loader replaces same-run rows, so it
   must not be silently presented as immutable original-knowledge replay.
2. Full historical workbook migration/year resolution and source publication
   reconstruction are not complete. No guessed years or timestamps are imported.
3. UI daily chart and exact-contract intraday panes are connected. Four stacked
   monthly/weekly/daily/intraday context panes, approved level overlays and the
   price-coordinate OI profile remain unfinished.
4. Exact option minute-history coverage is source-dependent; current token
   metadata is not a versioned historical instrument master.
5. Stock-specific comparable 30-session turnover/delivery provider and alert
   escalation are unfinished. NIFTY spot volume/delivery remains not applicable.
6. Morning delta baseline selection, scheduled evidence transitions, original vs
   revised replay, outcome studies and holdout evaluation are not complete.
7. Live SmartAPI account capability/rate/reconnect probes, restore drill and full
   external data-display permissions are not verified. No new broker login made.
8. Stops, targets, sizing, portfolio risk and execution authority are not supplied.
   This release cannot emit executable paper/live trades.

## SmartAPI and NSE documentation review

Both supplied/modern SmartAPI portals returned an authorization page. Official
SDK inspection verifies interface definitions, **not successful account probes**:

- [SmartConnect official SDK](https://raw.githubusercontent.com/angel-one/smartapi-python/main/SmartApi/smartConnect.py): candles, historical OI, quotes, Greeks, PCR routes.
- [WebSocket V2 official SDK](https://raw.githubusercontent.com/angel-one/smartapi-python/main/SmartApi/smartWebSocketV2.py): LTP/QUOTE/SNAP_QUOTE modes and payload decoder.
- [NSE CAS](https://www.nseindia.com/static/products-services/closing-auction-session) and [FAOP75472](https://nsearchives.nseindia.com/content/circulars/FAOP75472.pdf): date-effective phase references.

The existing Go collector already has quote, PCR and SNAP_QUOTE code; the new
workspace reads its persisted outputs. Do not copy SDK examples that log headers
or weaken TLS validation. Browser never receives broker credentials.

## Reproduce and roll back

```bash
cd /home/novius2/trading-stack
PYTHON=/home/novius2/NIFTY50/Histroical-data-extract/.venv/bin/python
$PYTHON scripts/trading-analytics-import.py \
  --source-dir /home/novius2/NIFTY50/The_Nifty_Options_stragty-2 --validate-only
# For reviewed additive import, first apply db/sql/057_trading_analytics_provenance.sql.
# Generate SQL with --archive-dir pointing to an external/ignored artifact directory.
# Execute with psql -v ON_ERROR_STOP=1; never truncate existing canonical tables.
cd neon-stock-terminal/apps/api
npm test
npm run build
# Explicit capture, with DATABASE_URL supplied securely:
npx tsx src/scripts/captureTradingAnalytics.ts <nonfuture-ISO-asOf>
```

Feature switch: `N50_TRADING_ANALYTICS_ENABLED` maps to backend
`TRADING_ANALYTICS_ENABLED` and build-time `VITE_TRADING_ANALYTICS_ENABLED`.
Set false and rebuild/recreate only n50-dashboard for rollback; retain sources
and evidence. Never restore old strategy/database files to remove this UI.
