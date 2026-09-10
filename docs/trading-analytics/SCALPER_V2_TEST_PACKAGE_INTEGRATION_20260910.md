# Scalper V2 Test-package integration and native strike Delta OI profile

Date: 10 September 2026

## Scope and source review

All Markdown and ZIP inputs under `/home/novius2/NIFTY50/Test` were treated as
specification/reference evidence. They were extracted to a temporary directory;
no application file was copied from either package. Reviewed inputs:

- `Strike_Delta_OI_Fix_Codex_20260910_v3_0.md` and the complete reference ZIP,
  including TypeScript geometry, canvas adapter, deterministic tests and demo.
- `TradingView_Experience_Codex_20260910_v4_0.md`, acceptance contract, rebuild
  handoff and its ZIP reference images/JSON.
- Both `TradingView_Experience_Rebuild_20260910_v4_0` Markdown copies. Their
  SHA-256 values are identical, so they are one specification revision rather
  than two independent requirements.

The reference package's 30 deterministic Node tests pass. The v4 acceptance
JSON parses as revision `2026-09-10-v4.0`, contains its declared 89 cases (74
P0), and correctly labels all of them `NOT RUN`; those declarations were not
misreported as production evidence.

## Critical findings

The existing V2 already provided full-width measured charts, Fit day, linked
inspection, the separate horizontal Delta OI chart and a right-edge underlying
profile. The remaining profile path was a React-rendered DOM overlay whose
geometry was refreshed by selected pointer/resize events. It had four material
problems:

1. price-axis transformations could occur outside its refresh triggers;
2. zero Delta OI disappeared and was assigned the negative CSS branch;
3. a generic baseline label could cover rows with different baseline kinds;
4. exact baseline/current/source evidence was available only indirectly or in
   hover titles, not through a structured keyboard-readable alternative.

## Implemented repair

- Replaced the DOM bars with `ScalperV2OiProfilePrimitive`, attached to the
  underlying candlestick series. Strike Y coordinates now come directly from
  the owning series on every primitive view update and do not create another
  price axis or autoscale input.
- The profile occupies at most 120 CSS pixels and 18 percent of the native plot,
  immediately inside its right price scale. Its maximum is calculated from the
  full selected cohort before off-screen strikes are clipped.
- Horizontal length represents absolute magnitude. Positive change is green,
  negative red, observed zero a neutral zero mark, and missing comparison a
  dashed neutral mark. CE uses a solid blue outline; PE uses a dashed dark-yellow
  outline. Both lanes share the exact strike centre.
- Added a normalizer that deduplicates strike-side identities and chooses one
  declared comparison basis by priority. Rows with another baseline definition
  remain visible as incompatible/unavailable; they are not mixed or zero-filled.
- Added a `Delta OI profile` inspector section with exact strike, current OI,
  baseline OI, signed change, baseline kind/time, current time, source and unit
  access. Hovering its rows highlights the same underlying strike without
  changing the selected option pair.
- Kept the separate Change in OI analytical chart horizontal, with strike on
  the right-side Y axis and signed provider-unit Delta OI on X.
- Re-audited the retained production cohort after the first deployment. Ten
  strikes were supplied, but only two were inside the observed session price
  viewport. This is required clipping, not missing data: the source contract
  explicitly forbids automatically widening the default candle range.
- Added a visible `shown/total strikes` status and an explicit `All strikes Y`
  action. It expands only the underlying Y range to the complete cohort plus a
  small drawing margin. Every bar still uses its true underlying-price
  coordinate. `Session Y` restores the readable observed-session envelope.

No API, database, collector, V7 signal, A-open/B-close measurement, position,
notification, broker/order or permission contract changed.

## Verification

- Focused Scalper V2 tests: 22/22 PASS, including new single-baseline,
  missingness, deduplication, full-cohort scaling and native-coordinate cases.
- Full web tests: PASS. Web typecheck and production build: PASS.
- API tests: 194/194 PASS. API typecheck and build: PASS; API source unchanged.
- Authenticated local browser regression: 54 PASS, 0 FAIL, 1 BLOCKED. It covers
  full-width chart geometry, visible time axes, profile modes, 120px gutter,
  accessible profile evidence, linked inspection, no hover hydration/network,
  responsive widths, a native Y-axis gesture with 0px profile-coordinate error,
  and 20 V1/V2 lifecycle cycles.
- Browser geometry at 1920x1080: underlying 773.03px wide with 601.22px body;
  CE/PE 606.97px wide with 267.22px bodies. Native and host widths reconcile.
- Interaction measurement: 500 pointer moves p95 17.1ms; cached 5m-to-1m switch
  142ms on headless Chromium/DPR1. These are test-host measurements.
- Headless DPR2 backing-store crispness remains BLOCKED pending a headed-browser
  visual check; DPR2 width reconciliation passed.

Follow-up verification after adding the explicit all-strikes fit:

- Full web tests: 144/144 PASS; typecheck and production build PASS.
- API tests: 194/194 PASS; typecheck and build PASS; API remains unchanged.
- Authenticated local browser regression: 56 PASS, 0 FAIL, 1 BLOCKED (the same
  headed-DPR2 visual check).
- Retained data: Session Y reports 2/10 visible strikes; All strikes Y reports
  10/10, with finite coordinates and 0px maximum alignment error.
- Pointer p95 remained 17.1ms over 500 moves; cached interval switch was 168ms
  on the recorded headless test run.
- Browser evidence:
  `/tmp/scalper-v2-all-strikes-local-final/screenshots/all-strikes-y.png`.

The follow-up was deployed and repeated against the production container:

- Application commit: `e8d3645` (`fix scalper v2 all strikes y fit`).
- Deployed browser regression: 56 PASS, 0 FAIL and the same one headed-DPR2
  visual check BLOCKED.
- Deployed retained cohort: 10/10 strikes visible in All strikes Y with 0px
  alignment error; Session Y remains the non-compressed default.
- Dashboard image:
  `sha256:661fe478b3777be70961eb04937c7b3c870e6047263ec91a6a7eff9c0edbce66`.
- `n50-dashboard` is healthy with zero restarts. Local production Scalper V2 and
  public `https://n50.nifty50today.co.in/n50/` return HTTP 200. The separate
  `https://m.nifty50today.co.in/` edge still returned HTTP 502 and is not used
  to claim the working n50 hostname failed.
- Deployed browser evidence:
  `/tmp/scalper-v2-all-strikes-deployed/screenshots/all-strikes-y.png`.
- Follow-up rollback image:
  `trading-stack-n50-dashboard:pre-scalper-v2-all-strikes-e8d3645`.

The same authenticated regression was repeated against the deployed production
container: 54 PASS, 0 FAIL and the same single headed-DPR2 check BLOCKED. The
deployed screenshot confirms the native strike profile is inside the underlying
plot and the separate horizontal Change in OI chart retains Strike on its right
Y axis.

Ignored browser artefacts are under `/tmp/scalper-v2-delta-oi-local-final/`.
Deployed browser artefacts are under `/tmp/scalper-v2-delta-oi-deployed/`.

## Delivery and deployment

- Application commit: `5b144a7` (`fix scalper v2 native strike delta oi profile`).
- Pushed branches: canonical `master` and
  `feat/scalper-v2-chart-delta-oi-upgrade`.
- Deployed dashboard image:
  `sha256:77b2183295869c04e39dc03cd9f4716f96867183e06d0d1eb15c7a4ab2be4aea`.
- Only `n50-dashboard` was rebuilt/recreated. It is healthy with zero restarts;
  the local root and Scalper V2 route return HTTP 200.
- The public `https://m.nifty50today.co.in/` edge returned HTTP 502 during the
  post-deploy verification, although the local production gateway with the same
  host routing returned HTTP 200. Public reachability is therefore BLOCKED on
  the external edge and is not claimed as passing.
- Rollback image:
  `trading-stack-n50-dashboard:pre-scalper-v2-native-deltaoi-5b144a7`.

## Deliberately not claimed

The broad v4 handoff is a staged product programme. This pass integrates its
existing-renderer and strike-Delta-OI P0 requirements; it does not claim full
TradingView parity, every proposed layout, indicator library, alert engine,
replay engine or multi-chart comparison layout. Missing historical chain/OI
snapshots remain unavailable and are not inferred from later data.

## Rollback

This is frontend-only. Redeploy the tagged rollback image above or revert the
application commit and rebuild the dashboard; no database rollback is required.
