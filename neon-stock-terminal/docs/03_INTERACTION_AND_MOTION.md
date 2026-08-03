# Interaction and motion spec (futuristic, but minimal)

This is how we introduce “futurism” while maintaining a strict palette.

---

## 1) Liquid backdrop

**Intent:** provide a living ambient background without distracting from data.

Rules:
- Only one accent at a time (green OR red), chosen by Nifty direction.
- Use blur + drift (slow movement).
- No multi-hue gradients.
- Keep opacity low (ambient).

Implementation:
- `LiquidBackdrop` component
- Driven by `accent = changePct >= 0 ? green : red`

---

## 2) Glitch KPI

**Intent:** add energy to the central KPI without adding clutter.

Rules:
- Only on the **main Nifty value** (and optionally the symbol on stock detail).
- Must remain readable.
- Use small offsets + clip slices.
- No rapid flashing (avoid seizure risk).

Implementation:
- `GlitchText` with `::before` and `::after`
- Clip slices using `clip-path` and animated transforms

---

## 3) Ticker tape

Rules:
- Continuous loop
- Speed: ~20–40 seconds per full loop depending on content length
- Must not jitter on resize; use duplicated content blocks

Implementation:
- CSS marquee animation or requestAnimationFrame scroller

---

## 4) Leaderboard reorder

Rules:
- When new data arrives, rows may reorder.
- Reorder animation must be smooth and short.
- Avoid bounce; use linear / ease-out.

Implementation:
- `framer-motion` layout animations OR CSS FLIP technique

---

## 5) Neon button

Rules:
- Button is minimalist; neon is signal.
- Hover: border tracer + glow
- Active: slight inward translation (1px)

Implementation:
- `NeonButton` with pseudo-element highlight sweep
