# Scalper V3 compact evaluation workspace

Date: 22 September 2026  
Route: `/n50/strategy/trading-analytics?view=scalper_v3`  
Scope: additive presentation experiment; Scalper V2 remains independently selectable.

## Purpose

Scalper V3 tests a data-canvas-first layout using the existing Scalper V2 queries, exact CE/PE selection, indicators, drawings, measurements, cursor coordinator and analytical models. It does not fork market calculations, create another collector, alter a strategy, or change order permissions.

## Desktop geometry

- Upper canvas columns: approximately 41% NIFTY, 37% paired CE/PE, 22% strike analytics.
- NIFTY spans the full upper height. CE and PE split the middle column equally.
- Right rail order: shared docked strike inspector, OI by strike, Delta OI by strike, Strike Structure, and Strike by Time Positioning. The heatmap receives the larger share of the lower half.
- The bottom strip preserves the same 41/37/22 boundaries for PE-minus-CE OI, PE-minus-CE Delta OI and range-normalised CE/PE.
- Panel gaps and outer padding are 4px. Plot containers use square 1px boundaries rather than padded card chrome.
- The bottom strip defaults to 180px and can be adjusted from 150px to 320px. Its open state and height are stored only in the browser-local V3 namespace.

## Interaction

- Existing native price-chart time cursor/range synchronization remains authoritative.
- Existing analytical time hover and strike-category hover remain authoritative.
- Hovering an OI/Delta OI/Strike Structure category updates one docked inspector instead of showing a large floating tooltip over the compact panel.
- The right analytical rail and bottom strip can be independently collapsed. Reset Layout restores both and a 180px bottom strip.
- The drawing toolbar occupies a 6px edge handle until pointer/focus reveals its 32px overlay.
- Existing analytical expand buttons remain available, and every analytical panel also expands on double-click. Native price panes maximize in place on double-click and restore on a second double-click or Escape.

## Chrome reduction

- V3 replaces the row of Trading Analytics destinations with one workspace selector.
- The outer context bar and V3 command bar are each constrained to compact controls.
- Per-panel refresh stamps remain in the evidence DOM but are hidden in V3; the existing global freshness control remains visible.
- Mini-panel metadata lines are suppressed while full titles/calculation details remain available through chart actions and V2.
- V2 styling and saved state are unchanged because every layout override is scoped to `[data-layout="v3"]`.

## Responsive policy

Below 1200px the primary chart becomes a full-width row, CE/PE remain paired below it, the right analytics use a two-column grid, and the bottom charts retain contained sizing. Below 768px all panels stack vertically and the drawing edge handle is removed so it cannot cover touch content.

## Acceptance evidence

Run:

```bash
cd /home/novius2/trading-stack
node tools/playwright/scalper-v3-compact-evaluation.mjs
```

The test records 1920x1080 and 1440x900 screenshots, measured column shares, CE/PE alignment, upper-height reconciliation, bottom-strip height, docked inspector visibility, collapse/restore behavior, V2 reachability and browser errors under `/tmp/scalper-v3-compact-evaluation/` by default.

## Limitations of this evaluation pass

- Column widths are fixed at the requested 41/37/22 proportions. The requested draggable vertical splitters are deferred until the visual evaluation establishes that the default geometry is worth retaining.
- The range-normalised view intentionally retains V2 arithmetic and is not redefined by this layout experiment.
