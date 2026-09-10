# Scalper independent CE and PE selection — 10 September 2026

## Outcome

Both existing Scalper views now select the exact call and exact put independently. The two contracts continue to share the explicitly selected expiry; this change does not add cross-expiry combinations. A legacy `strike=` link still initializes both legs to the same strike, while a mixed selection is represented losslessly as `ceStrike=` and `peStrike=`.

The implementation remains read-only. V7 signal calculation, A-open/B-close measurement arithmetic, source bars, option identities, exports and order permissions are unchanged.

## Implementation map

- `apps/api/src/routes/tradingAnalytics.ts`: accepts additive `ceStrike` and `peStrike` chart-query parameters and resolves one CE and one PE contract at their own strikes. `strike` remains the backward-compatible fallback. Available-contract discovery now retains a strike when either side has retained observations.
- `apps/web/src/lib/scalperContractSelection.ts`: one shared URL/query/availability adapter prevents V1 and V2 from developing different selection rules.
- `apps/web/src/pages/TradingAnalyticsScalper.tsx`: separate CE/PE selectors and ladder actions, atomic expiry rollover, dual-contract pin/measurement lock, and a stale-initialisation guard so a fast manual choice is not overwritten.
- `apps/web/src/pages/AlignedScalperTerminal.tsx`: selected identity, headers, inspector, profile guides and exports use each exact leg.
- `apps/web/src/pages/TradingAnalyticsScalperV2.tsx`: cache/query identity, background timeframe prefetch, selected metrics, measurement context and export identity include both strikes.
- `apps/web/src/pages/scalper-v2/ScalperV2Chart.tsx`: underlying guide identifies both strikes; a selected exact contract with no retained bars remains an honest empty pane and no longer receives an invalid linked range.
- `apps/web/src/pages/TradingAnalyticsPage.tsx`: symbol/chain context changes clear both additive strike parameters.

## Verification

- Web typecheck: PASS.
- Web tests: PASS, 147/147.
- Web production build: PASS.
- API typecheck/tests/build: PASS, 196/196 tests.
- Focused selection tests: PASS, 3/3.
- Focused API contract tests: PASS, 5/5 in the route test run.
- Candidate Docker image build: PASS.
- Authenticated local Chromium against an isolated candidate: PASS, 10/10.
  - V1 requested and loaded CE 23,700 with PE 23,250, retained both exact IDs in the URL, and locked both selectors for measurement.
  - V2 independently selected CE 25,750 with PE 21,900. The CE had no retained completed candle and remained visibly unavailable; PE data and both selected-strike guides remained rendered without substitution or a page crash.
  - Evidence: `/tmp/scalper-independent-contracts/results.json` and two 1440x1000 screenshots. These runtime artifacts are intentionally outside source control.
- Canonical repository source gate: PASS.

## Release state

Implemented and tested on `feat/scalper-independent-ce-pe`. No production container was replaced and no deployment is claimed. The isolated localhost candidate container was removed after validation.
