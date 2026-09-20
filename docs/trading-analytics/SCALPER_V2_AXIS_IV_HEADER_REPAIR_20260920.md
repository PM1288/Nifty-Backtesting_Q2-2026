# Scalper V2 axis, IV and header repair — 20 September 2026

## Outcome

The existing Scalper V2 workstation now uses one explicit session/linked time
domain across its native price charts and timestamp-based OI analytics. The two
primary lower charts align to the same 56/44 column split as the underlying and
CE/PE price areas. A shared inspected time is propagated to all time charts and
to the strike charts, where the nearest strike to the underlying value at that
time is highlighted.

The compact strike side pane retains OI and change in OI and adds a third chart:
change in implied volatility by strike. ΔIV is current exact-contract IV minus
the preceding retained observation for the same expiry, strike and option
right. It is expressed in percentage points. Missing comparable observations
remain unavailable and are never displayed as zero.

The cumulative PE-minus-CE OI and cumulative PE-minus-CE change-in-OI charts
include a vertical `Day open` timestamp marker. This is an X-axis event marker,
not an OI value. The independent lower-chart zoom was removed so Fit Day and
linked native pan/range determine their visible X extent.

The lower charts also use the native pane geometry: their time plot begins at
the left chart edge and reserves a 72px value-scale gutter on the right. This
removes the prior left-label offset, so the same timestamp maps into the same
visual column as the price pane above.

The duplicate Scalper V2 title/status strips were removed. Trading Analytics,
Health, Formula, Conditions, workspace navigation, OI PCR and Volume PCR now
share the parent header. The compact data-freshness control remains functional
inside the V2 command row. Pop out is the rightmost red action with an external
window symbol.

## Data semantics

- CE identity is yellow and PE identity is blue in the strike charts.
- Positive ΔIV is green, negative ΔIV red, and observed zero neutral; the side
  identity remains visible as the bar border.
- OI, ΔOI and ΔIV remain separate metrics and scales.
- A historical price cursor does not relabel a latest chain snapshot as
  historical. The inspector retains that explicit limitation.
- No strategy, signal, drawing, measurement, order permission or collector
  behavior changed.

## Files

- `apps/api/src/services/tradingAnalyticsSmartApi.ts`
- `apps/web/src/components/visual/EChartSurface.tsx`
- `apps/web/src/lib/scalperV2Analytics.ts`
- `apps/web/src/lib/scalperV2OiTime.ts`
- `apps/web/src/pages/TradingAnalyticsPage.tsx`
- `apps/web/src/pages/TradingAnalyticsScalperV2.tsx`
- `apps/web/src/pages/scalper-v2/ScalperV2Freshness.tsx`
- related scoped styles and tests

## Validation contract

Repository checks:

```bash
cd /home/novius2/trading-stack/neon-stock-terminal/apps/web
npm run typecheck
npm test
npm run build

cd /home/novius2/trading-stack/neon-stock-terminal/apps/api
npm run typecheck
npm test
npm run build

cd /home/novius2/trading-stack
bash scripts/verify/canonical-repository-gate.sh
```

Browser acceptance must verify the two-row header, red rightmost pop-out,
three strike panels, truthful ΔIV availability state, equal shared inspected
time on visible time charts, and no page reload during cursor movement.

## Completion evidence

- Web typecheck, 231/231 full tests and production build passed after the final
  time-gutter correction; its focused calculation/render suite passed 11/11.
- API typecheck, 256/256 tests and production build passed after the final
  correction. The canonical
  repository preservation gate passed.
- Authenticated Chromium against the deployed routed container passed 30/30
  targeted checks. Both header rows measured 34px; the lower columns measured
  809.75px / 636.25px against the same price-panel columns, all three native
  charts reported inspected time `1789716600`, and both rendered strike charts
  received active strike index `5`.
- Evidence and screenshots are stored outside Git at
  `/home/novius2/NIFTY50/evidence/scalper-v2-axis-iv-header-20260920-production/`.
- Production is healthy with zero restarts on image
  `sha256:162b84ec2c53a48eead729bf9798d81f90195f36046e59913c58fb3e9f43a288`
  and entry asset `/n50/assets/index-BxmOs6_s.js`.
- Current retained data had no comparable prior exact-contract IV observation,
  so the deployed browser correctly displayed `IV change unavailable`; the
  painted ΔIV path is covered by deterministic calculation/render tests rather
  than falsely claimed from unavailable live evidence.
