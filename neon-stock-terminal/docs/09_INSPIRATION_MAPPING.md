# Inspiration mapping (design references → repo components)

This repo implements effects **from scratch**, using the referenced demos as a *visual target only*.
Palette enforcement remains strict (black/white + one neon accent).

## Liquid “gradient” backdrop
Reference: https://codepen.io/cameronknight/pen/ogxWmBP

Repo implementation:
- `apps/web/src/components/visual/LiquidBackdrop.tsx`
- `apps/web/src/components/visual/LiquidBackdrop.module.css`

Key difference:
- One accent at a time (green OR red) to avoid mixing.

## Glitch KPI
Reference: https://codepen.io/ol-ivier/pen/jEMWMvz

Repo implementation:
- `apps/web/src/components/visual/GlitchText.tsx`
- `apps/web/src/components/visual/GlitchText.module.css`

Scope:
- Used on Nifty value and stock price.

## Dynamic chart (oscilloscope style)
Reference: https://codepen.io/KilledByAPixel/pen/BawBKqP

Repo implementation:
- `apps/web/src/components/visual/OscilloscopeChart.tsx`
- `apps/web/src/components/visual/OscilloscopeChart.module.css`

## Misc motion references
Reference: https://codepen.io/ash1198/pen/XJXVqMK

Repo implementation:
- `apps/web/src/styles/animations.css` (scanlines, glitch slices, marquee, border sweep)

## Minimalist “nature” button
Reference: https://codepen.io/Pedro-Ondiviela/pen/emzdMKj

Repo implementation:
- `apps/web/src/components/visual/NeonButton.tsx`
- `apps/web/src/components/visual/NeonButton.module.css`
