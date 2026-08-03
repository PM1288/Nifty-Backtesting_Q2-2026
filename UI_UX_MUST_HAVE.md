# UI / UX Must-Have Guardrails

This document is the single source of truth for UI and UX consistency across the N50 market learning dashboard.

Any future coding agent working on UI, layout, styling, charts, tables, navigation, or page structure must follow this document.

If a requested change conflicts with this document, the agent must either:
- update this document first, or
- get an explicit user instruction that overrides the relevant rule.

Do not silently drift from these rules.

## 1. Product Intent

This is a public-facing learning and market analytics product.

The UI must feel like one polished analytics platform:
- calm
- data-first
- neutral chrome
- consistent across pages
- educational, not theatrical

The shell must never overpower the data.

## 2. Core Principles

- Above the fold must show the key chart, heatmap, KPI strip, or primary analysis first.
- Explanatory copy, readme blocks, and helper text belong below the main visual unless the user explicitly asks otherwise.
- The shell must be minimal so the data stands out.
- Red and green are for market data only, not for general UI chrome.
- Gold is a restrained accent only.
- Do not introduce novelty styling, game-like panels, floating particles, or decorative effects.

## 3. App Shell Rules

Every page must use the same shell pattern:
- TopBar
- Sidebar
- Main content area
- Bottom disclaimer banner with safe spacing

No page may introduce its own separate header system or tab-strip navigation above the content.

### Sidebar

Desktop behavior:
- Collapsed by default on Home and Heatmap pages
- Collapsed width: 72px
- Expanded width: 248px
- State persists in local storage

Mobile behavior:
- Sidebar becomes overlay drawer
- Hamburger opens it
- `Esc` closes it

Visual rules:
- One flat dark surface
- Background: `#0B0D10`
- Right border: `1px solid rgba(255,255,255,0.08)`
- No nested cards
- No intro/explanation block inside the sidebar
- No oversized badge icons
- Use only small line icons
- Icon size: `16px`
- Nav row minimum height: `40px`
- Nav row padding: `10px 12px`
- Group labels: `11px`, uppercase, muted gray

Active nav state:
- Thin gold indicator bar on the left
- Subtle gold-tinted background
- White text

Hover state:
- Neutral background change only
- No glow
- No thick outline

Collapsed mode:
- Show tooltip labels on hover/focus

Approved navigation groups:
- Overview
  - Home
- Market
  - Market Hub
  - Market Story
  - Supporting Metrics
  - Option Chain
- Heatmaps
  - % Change
  - RSI
  - WILLR
- Learning
  - Strategy Lab
  - Simulator
  - Indicators
- System
  - Trust Board

Do not add helper descriptions under nav items.

### Top Bar

Top bar must stay compact and low-noise.

Allowed structure:
- Left: hamburger + brand
- Center: current page title
- Right: audience mode toggle + compact session control

Rules:
- Maximum visual height: 56px
- No bulky pills for brand
- No oversized circles
- No secondary tab bars
- No crowded action rows

## 4. Typography

Approved fonts:
- UI, shell, labels, controls, tables: `Inter Variable`, `Inter`
- Numeric-heavy elements: `IBM Plex Mono` or the approved mono token

Do not use decorative display fonts in:
- sidebar
- nav labels
- table cells
- page chrome
- charts
- heatmaps

Numeric rules:
- Use tabular numerals for prices, percentages, KPI values, legends, and tables
- Keep numeric alignment stable across rows and cards

## 5. Color System

Approved theme tokens:
- `--bg: #07090b`
- `--surface-1: #0f1318`
- `--surface-2: #0b0d10`
- `--border-subtle: rgba(255,255,255,0.08)`
- `--text-1: rgba(255,255,255,0.92)`
- `--text-2: rgba(255,255,255,0.72)`
- `--muted: rgba(255,255,255,0.54)`
- `--gold: #d4af37`
- `--red: #ff0033`
- `--green: #00ff66`

Usage rules:
- Neutral dark chrome only for shell surfaces
- Green and red are reserved for market state and performance values
- Gold is only for restrained accent use:
  - active nav indicator
  - warning emphasis
  - selective brand accent

Do not use bright market colors for:
- sidebar background
- top bar background
- generic buttons
- layout chrome

## 6. Background and Effects

The site background must remain static and dark.

Do not add:
- floating particles
- animated ambient blobs
- random glow fields
- decorative background noise that competes with charts

Subtle surface separation is allowed.

## 7. Data-First Page Structure

The first visible section of a page must prioritize the main analysis surface.

Approved above-the-fold priorities:
- Home: index strip + sector heatmap
- Market pages: main KPI row and primary chart/summary
- Heatmap pages: KPI strip + heatmap + legend
- Simulator: main metrics + readable charts
- Stock pages: top KPI row + primary trend/read

Move these below the main chart when possible:
- readme copy
- how-to text
- long explanations
- secondary supporting tables

If helper content is needed, use:
- accordion
- collapsible info card
- below-the-fold read block

## 8. Cards, Tables, and Controls

Cards must feel consistent across pages.

Rules:
- Same radius family
- Same border treatment
- Same padding rhythm
- Same text hierarchy

Tables must share:
- header styling
- row height
- hover state
- numeric alignment
- padding scale

Do not create page-specific table styling that makes pages feel like different products.

## 9. Charts

Charts must be readable without guesswork.

Required:
- visible axes where applicable
- labels
- readable ticks
- legends that never overlap plot content
- distinguishable series colors on dark backgrounds
- accessible hover tooltips

Legends must sit outside the data area when overlap risk exists.

Do not ship charts with:
- clipped axes
- overlapping legends
- hidden labels
- unreadable tiny fonts

## 10. Heatmaps

Heatmaps must use one shared semantics layer and one consistent legend system.

### Percent Change Heatmap

Rules:
- Clamp to `[-2%, +2%]`
- More negative = brighter neon red
- Near zero = dim neutral
- More positive = brighter neon green

Anchors:
- `-2%` -> `#FF1744`
- `0%` -> dark neutral
- `+2%` -> `#00E676`

### RSI Heatmap

Rules:
- Shared multi-stop scale only
- No alternate gradients per page

Anchors:
- `20` -> black
- `30` -> red
- `40` -> yellow
- `50` -> green
- `70` -> dark green
- `80` -> white

### WILLR Heatmap

Rules:
- Native `-100` to `0` scale
- Shared anchor points only

Anchors:
- `-100` -> black
- `-80` -> red
- `-50` -> yellow
- `-30` -> green
- `0` -> white

### Marker Rules

Marker triangles and directional markers must stay consistent across heatmaps.

Home heatmap direction markers:
- Up marker: solid gold with black text if text exists inside the badge
- Down marker: black

Do not use different triangle sizes for `% change`, `RSI`, and `WILLR`.

## 11. Disclaimer Banner

The disclaimer must stay visible but never block charts or heatmaps.

Required behavior:
- fixed bottom banner
- slim single-line presentation by default
- safe bottom padding applied to content
- `Read more` opens modal or drawer

Modal must support:
- close button
- backdrop click
- `Esc` close

Do not allow the banner to overlap:
- heatmaps
- chart axes
- legends
- table rows

## 12. Performance and Density Rules

Dense pages are allowed only where the product requires them.

When a page is intentionally dense:
- say so explicitly in UI
- use virtualization for long tables
- keep row styling consistent

Do not waste vertical space above critical charts.

## 13. Forbidden Changes

Future agents must not introduce the following without explicit user approval and a document update:
- a second navigation system
- header pill rows or tab strips above page content
- nested sidebar cards
- oversized icon badges
- bright green/red shell chrome
- floating particles or visual clutter
- decorative fonts in shell/navigation
- page-specific heatmap color rules
- chart legends that overlap the plot
- fixed disclaimer overlays without content padding
- large readme blocks above the main chart
- inconsistent table styling between pages

## 14. Required Acceptance Checks

Any significant UI change must be validated against these checks:
- Home and heatmap pages show the primary chart above the fold on desktop
- Sidebar is collapsed by default on Home and Heatmap pages
- Sidebar tooltips work in collapsed mode
- Mobile drawer opens and closes correctly
- `Esc` closes drawer and disclaimer modal
- Footer disclaimer does not overlap content
- Active nav state uses restrained gold accent only
- Tables remain visually consistent across pages
- Heatmap legends are visible and outside the plot area
- Market colors remain reserved for market data

## 15. Rule for Future Agents

When touching UI:
- read this document first
- preserve uniformity before adding new features
- prefer extending shared primitives over page-specific styling
- treat deviation from these rules as a bug, not a design choice
