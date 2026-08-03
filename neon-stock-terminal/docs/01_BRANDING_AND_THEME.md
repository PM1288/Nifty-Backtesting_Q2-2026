# Branding and theme rules (strict)

This document is a **hard contract**. UI changes must comply, even for experimental features.

---

## 1) Palette constraints (non-negotiable)

Allowed colors ONLY:

- **Black**: `#000000`
- **White**: `#FFFFFF`
- **Neon Red** (and only its shades/tints)
- **Neon Green** (and only its shades/tints)
- **Opacity whites** (RGBA white on black for “grays”)

### 1.1 Semantic meaning is strict

- **Green = up / positive / confirm / success**
- **Red = down / negative / warn / error**
- **White = neutral, structure, base typography**
- **Black = canvas, minimal filled surfaces**

### 1.2 Forbidden

- Any other hue (blue, yellow, orange, purple, etc.)
- Hex “grays” like `#111`, `#1b1b1b`, etc.
- Red+Green blending that creates yellow-ish mixes
  - If you use a “liquid” backdrop, keep **one accent at a time** (based on market direction).

---

## 2) Color tokens

All styling must reference tokens.

### 2.1 Base tokens

- `--black: #000000`
- `--white: #FFFFFF`

### 2.2 Neon tokens

**Red**
- `--red-500: #FF0033`
- `--red-600: #D9002B`
- `--red-700: #B20024`
- `--red-800: #8C001C`
- `--red-900: #660014`

**Green**
- `--green-500: #00FF66`
- `--green-600: #00D957`
- `--green-700: #00B247`
- `--green-800: #008C38`
- `--green-900: #006629`

### 2.3 White opacity scale (replaces grays)

- `--w-92: rgba(255,255,255,0.92)` (primary text)
- `--w-72: rgba(255,255,255,0.72)` (secondary)
- `--w-54: rgba(255,255,255,0.54)` (tertiary)
- `--w-38: rgba(255,255,255,0.38)` (muted/disabled)
- `--w-12: rgba(255,255,255,0.12)` (borders)
- `--w-08: rgba(255,255,255,0.08)` (dividers)
- `--w-04: rgba(255,255,255,0.04)` (subtle surfaces)

### 2.4 Glow tokens (allowed shadows)

- `--glow-red: 0 0 12px rgba(255, 0, 51, 0.35)`
- `--glow-green: 0 0 12px rgba(0, 255, 102, 0.35)`
- `--glow-white: 0 0 10px rgba(255,255,255,0.18)`

---

## 3) Typography rules

- Font: `Inter` (fallback to system UI)
- Numeric formatting: **tabular numerals**
- Use **short labels**, not marketing copy

### 3.1 Type scale

- Display: 28/32 (rare)
- H1: 20/28
- H2: 16/24
- Body: 14/20
- Caption: 12/16
- Micro: 11/14 (tables meta only)

### 3.2 Weights (strict)

- 400 regular
- 500 medium (labels/headings)
- 600 semibold (key price only)

---

## 4) Layout + density rules

- Default canvas: pure black
- Minimal “surfaces”: use `--w-04` overlays if needed
- Borders: `--w-08` or `--w-12`
- Corners: 8px (containers), 999px (pills)

---

## 5) Branding voice and tone

- Analytical
- No hype words (“moon”, “double”, “rocket”, etc.)
- Explain uncertainty if data is delayed or missing
- Always emphasize “learning platform” and “educational purpose”
