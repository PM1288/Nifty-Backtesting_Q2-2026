# Scalper V2 OI-axis repair — 10 September 2026

## Outcome

The existing `view=scalper_v2` analytical section now keeps OI and signed
delta-OI axis meaning visible without placing a long unit label on top of the
chart ticks or legend.

- OI uses a visible left value axis with compact `K`, `L` and `Cr` tick labels.
- OI and delta-OI each have a dedicated unit strip: Y is provider-native OI
  quantity/change and X is strike.
- Legends occupy their own top plot row and strike labels occupy the bottom
  row.
- Delta-OI has an explicit zero reference when comparable values exist.
- When the retained baseline is unavailable, the panel does not manufacture
  zero bars. It states that no bars are drawn until a comparable baseline
  exists.
- Exact raw values remain available in tooltips and exports. The compact
  formatter is presentation-only.

No price data, OI arithmetic, V7 signal rule, A-open/B-close measurement,
collector, API, database, order permission, V1 view, Trade Log or SHAP route
was changed.

## Files

- `neon-stock-terminal/apps/web/src/pages/TradingAnalyticsScalperV2.tsx`
- `neon-stock-terminal/apps/web/src/pages/scalper-v2/ScalperV2.module.css`
- `neon-stock-terminal/apps/web/src/lib/scalperV2.ts`
- `neon-stock-terminal/apps/web/tests/scalperV2.test.ts`
- `tools/playwright/scalper-v2-repair-regression.mjs`

## Verification

- Web typecheck: PASS.
- Web tests: PASS, 130/130.
- Web production build: PASS, 2,565 modules.
- API typecheck/build: PASS; API tests remain PASS, 193/193.
- Canonical repository gate: PASS.
- Local authenticated Chromium: 37 executable checks PASS, one existing
  headed-DPR2 visual check BLOCKED.
- Deployed authenticated Chromium: 39 executable checks PASS, zero FAIL;
  the same headed-DPR2 visual check remains BLOCKED because headless Chromium
  reports 1:1 native canvas backing dimensions despite DPR2 emulation.
- New `SV2-OI-AXIS-LABELS` and `SV2-OI-AXIS-CONTAINMENT`: PASS.
- Desktop and 390px mobile screenshots were visually inspected. Evidence is
  intentionally outside Git under `/tmp/scalper-v2-oi-axis-deployed-04bf049-rerun/`.

One first post-deployment lifecycle run recorded an intermittent promise error
after rapid V1/V2 cycling. A complete immediate rerun passed with no page
errors; this is not represented as a deterministic repaired defect.

## Release

- Application commit: `04bf04990c9fb02ac44bd2d0a725aa0bad97b650`.
- Branch: `fix/scalper-v2-oi-axis-overlap`, fast-forwarded and pushed to
  canonical `master`.
- Deployed dashboard image:
  `sha256:4b4bc49b0983b89f8df84374ec503a1f8cad1bc37b495a49c7d68cd1a456320b`.
- Container: healthy, zero restarts after verification.
- Local root, local health and public root: HTTP 200.
- Rollback tag: `trading-stack-n50-dashboard:pre-scalper-v2-oi-axis-04bf049`
  (image `sha256:4dd54f6b686d9169fd1846cc989e6dfe45209c37239c0a2195b3a707748a4fee`).
- Only `n50-dashboard` was rebuilt/recreated. No database or worker was changed.

## Current data limitation

The deployed retained observation currently reports zero comparable delta-OI
contracts out of twenty. This is a missing-baseline state, not a renderer
failure and not observed zero change. The chart will render signed bars and its
zero reference when comparable baseline data is supplied by the existing
authoritative source.
