# NIFTY-driven Gradient Waves

## Outcome

Deployed 15 August 2026 at 05:45 UTC. The authenticated application shell now renders one shared,
fixed gradient-wave background behind every dashboard. It uses the canonical NIFTY 50 quote already
consumed by `AppShell`; no additional poller, WebSocket, backend endpoint or database field was added.

The visual direction follows the ReactBits dynamic-background pattern while remaining a repository-native
SVG/CSS implementation with no new rendering dependency.

## Market colour policy

| NIFTY 50 session change | Background tone |
|---:|---|
| Greater than `+0.20%` | Green / emerald |
| `-0.20%` through `+0.20%`, inclusive | Yellow / amber |
| Less than `-0.20%` | Red / rose |
| Missing or non-finite | Neutral yellow / amber fallback |

The current deployed snapshot was `-0.12%`, so production correctly rendered the neutral amber state.
The precise value is exposed as a non-interactive data attribute for diagnostics but the layer is hidden
from the accessibility tree because it conveys no information that is not already visible in the ticker.

### Magnitude and RSI dynamics

- Direction still selects the semantic hue: positive green, neutral amber and negative red.
- Absolute NIFTY change controls brilliance continuously: `brilliance = clamp(abs(changePct) / 2, 0, 1)`.
- A flat session is deliberately pale; a `1.00%` move uses `0.50` brilliance and a `2.00%` or larger
  move uses full bounded brilliance. Saturation and wave opacity rise together while the white readability
  wash recedes within a safe limit.
- NIFTY RSI controls speed through its distance from 50:
  `driftSeconds = 28 - (abs(RSI - 50) / 50 × 16)`.
- RSI 50 uses the calmest 28-second drift. RSI 20 and RSI 80 produce the same faster 18.4-second drift;
  extremes approach 12 seconds. This treats oversold and overbought momentum symmetrically.
- Missing RSI remains at the calm 28-second cycle rather than using a fabricated indicator value.
- Current live reconciliation: NIFTY `-0.12%` → brilliance `0.06`; RSI `69.52` → `21.75s` drift.

## Architecture and safety

- Mounted once in `AppShell`, so route changes cannot create duplicate wave layers.
- Reads live `NIFTY50.changePct`, then the canonical overview snapshot, then ticker snapshot fallback.
- Does not subscribe to an additional quote stream.
- Uses `pointer-events: none` and remains behind the content/chrome stacking layer.
- Light canvases, low-opacity waves and a white soft-light overlay preserve dashboard readability.
- `prefers-reduced-motion: reduce` removes all wave/path animation.
- Existing global Calm mode and Pause motion state pause the animations.
- Mobile uses a wider, lower-opacity wave composition and has no body overflow.
- No API, schema, collector, Paper Trading, OIIS, notification or trading calculation changed.

## Changed files

- `neon-stock-terminal/apps/web/src/components/visual/marketGradientWaves.ts`
- `neon-stock-terminal/apps/web/src/components/visual/MarketGradientWaves.tsx`
- `neon-stock-terminal/apps/web/src/components/visual/MarketGradientWaves.module.css`
- `neon-stock-terminal/apps/web/src/components/chrome/AppShell.tsx`
- `neon-stock-terminal/apps/web/src/components/chrome/AppShell.module.css`
- `neon-stock-terminal/apps/web/tests/marketGradientWaves.test.ts`
- `tools/playwright/market-gradient-waves-regression.mjs`

## Validation

```text
cd neon-stock-terminal/apps/web
npm test
# PASS: 26 tests, 0 failed

npm run build
# PASS: TypeScript and Vite production build; 2,487 modules transformed

node tools/playwright/market-gradient-waves-regression.mjs
# FINAL PASS after RSI refinement: 114/114 checks
```

Browser coverage:

- 8 representative routes: Today, Markets, Stock 360, Strategy, Paper Trading, Derivatives,
  Data & Operations and Admin.
- Desktop `1366x768` and mobile `390x844`.
- One layer per route, valid market tone, exposed threshold semantics, reduced-motion animation disabled,
  exact change-to-brilliance reconciliation, exact RSI-to-speed reconciliation, no body overflow and no
  relevant console errors.

Earlier browser attempts are retained rather than hidden: one run recorded two transient
`ERR_NETWORK_CHANGED` messages during rapid navigation, and the next run timed out waiting for a second
Paper Trading data load. The final run added route-settle time and passed the same 82 assertions cleanly.

Evidence:

- `output/playwright/market-gradient-waves-20260815-pass/results.json`
- `output/playwright/market-gradient-waves-20260815-pass/desktop-1366x768-dashboard.png`
- `output/playwright/market-gradient-waves-20260815-pass/mobile-390x844-dashboard.png`
- Loaded Paper dashboard visual review:
  `output/playwright/market-gradient-waves-20260815-final/desktop-1366x768-paper.png`
- Final magnitude/RSI evidence: `output/playwright/market-gradient-waves-rsi-20260815/results.json`
- Final desktop visual: `output/playwright/market-gradient-waves-rsi-20260815/desktop-1366x768-dashboard.png`
- Final mobile visual: `output/playwright/market-gradient-waves-rsi-20260815/mobile-390x844-dashboard.png`

## Deployment and rollback

- Image: `trading-stack-n50-dashboard:latest`
- Deployed image digest: `sha256:bf8b8b8699b89294015332051f3408de872262e31160c939ac719af3226c26b8`
- Container: `trading-stack-novius2-n50-dashboard-1` — healthy
- Runtime health: application ready, PostgreSQL connected, Redis session store ready
- Backup: `/home/novius2/trading-stack/backups/market-gradient-waves-20260815T054200Z`
- Pre-RSI refinement backup: `/home/novius2/trading-stack/backups/market-gradient-waves-rsi-20260815T055000Z`

Rollback restores the two backed-up shell files, removes the three new visual-component files, rebuilds
only `n50-dashboard`, and recreates only the `trading-stack-novius2` dashboard service. No database rollback
is required.
