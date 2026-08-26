# Paper Trading Evidence Table — Cell Alignment Refactor

Date: 26 August 2026  
Production commit: `36862d4`  
Route: `/n50/paper-trading?section=trade-evidence`

## Scope

This change keeps the existing Paper Trading Trade Evidence table as the primary evidence surface. It does not change strategy logic, accounting, API fields, trade states, target states, filters, the inspector, exports, grouped headers, or column presets.

The implementation replaces per-column free-flowing JSX with typed cell renderers that share a five-slot baseline:

```text
Primary → Secondary → Detail → Supporting → Metadata
```

Unused lower slots remain reserved. They are not vertically centred and they do not invent data.

## Renderers

- `TradeIdentityCell`
- `DirectionCell`
- `StrategyCell`
- `CapitalCell`
- `EconomicsCell`
- `TargetOutcomeCell`
- `HorizonCell`
- `TimeInTradeCell`
- `RewardPainCell`
- `CarryCell`
- `QualityCell`
- `CommentsCell`
- `ActionCell`

Implementation: `neon-stock-terminal/apps/web/src/components/paper/PaperEvidenceCells.tsx`

## Fixed geometry

| Density | Row height | Information availability |
|---|---:|---|
| Dense | 82 px | Unchanged |
| Comfortable | 98 px | Unchanged |
| Audit | 112 px | Unchanged |

Semantic column widths are defined in `src/lib/paperEvidenceGeometry.ts` and applied through the table `colgroup`. Trade, Direction, and Entry Strategy remain sticky on the left at `0`, `220`, and `320` px. View remains sticky on the right.

All financial cells use right alignment and tabular lining numerals. Identity and descriptive cells remain left aligned. Direction and target states are centred. The first column of every major group has a subtle two-pixel divider.

## State presentation

- HIT, NOT HIT, and OPEN target cells use identical four-line geometry.
- 5D and 30D cells use identical maturity, MFE, MAE, outcome, and scaled-value positions.
- Capital bases and actual economics keep stable line positions.
- Missing values render as `—`; numeric zero continues to render as zero.
- Cell fills retain the existing green, red, amber, and blue semantics at lower saturation.
- State words and principal values carry the stronger semantic colour.

## Preservation

The following presets remain unchanged:

```text
All fields · Execution · Targets · Horizon · Risk · Quality
```

The following table evidence remains present:

- 3 Trade & Entry columns.
- 3 Capital & Actual Economics columns.
- 7 Target Outcome columns.
- 3 Horizon Evidence columns.
- 3 Reward, Pain & Carry columns.
- Quality and Admin Comments.
- Sticky View action and unchanged trade inspector.

Long company/strategy/comment text remains in the DOM and has a title/inspector path when visually truncated.

## Validation

Commands:

```bash
cd /home/novius2/trading-stack/neon-stock-terminal/apps/web
npm test
npm run build-storybook
npm run build

cd /home/novius2/trading-stack
PLAYWRIGHT_ADMIN_PASSWORD="$DEV_LOCAL_AUTH_PASSWORD" \
  node tools/playwright/paper-evidence-geometry-regression.mjs
```

Results:

- Unit tests: 60 passed, 0 failed.
- Production build: passed.
- Storybook production build: passed.
- Targeted lint for new files: passed.
- Live Playwright geometry/content checks: 60 passed, 0 failed; the final run is recorded in `output/playwright/paper-evidence-geometry/results.json`.
- Screenshot: `output/playwright/paper-evidence-geometry/paper-evidence-table-1920x1080.png`.
- Screenshot: `output/playwright/paper-evidence-geometry/paper-evidence-table-1440x900.png`.

Repository-wide lint is not a release gate in the current checkout because it reports pre-existing errors across unrelated application files and generated Storybook output. No new-file lint errors were found.

## Rollback

Pre-deployment dashboard image:

```text
trading-stack-n50-dashboard:rollback-20260826-36862d4-pre
```

Only the `n50-dashboard` container was rebuilt/recreated. Data collectors, paper-trading services, schedulers, and databases were not restarted or changed.
