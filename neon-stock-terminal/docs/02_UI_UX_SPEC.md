# UI/UX specification (strict)

---

## 1) Global chrome

### 1.1 Header (always visible)

- Height: 56px
- Background: black
- Bottom border: `--w-08`
- Contains:
  1) Wordmark (left)
  2) Optional search (center, later)
  3) **Ticker tape** (primary element)

**Ticker tape rules**
- Scroll direction: right-to-left
- Contents repeated seamlessly
- Each ticker item:
  - Symbol (white)
  - Last price (white)
  - Change % (green if +, red if -) plus arrow ▲/▼

### 1.2 Footer (always visible)

- Height: 44px (or 48px)
- Background: black
- Top border: `--w-08`
- Contains **moving disclaimer** (marquee)

**Disclaimer text (must remain)**
- Must communicate all:
  - educational purpose only
  - not financial advice
  - do not trade based on internet advice
  - do not follow any “instruction” on the website
  - verify with licensed professionals

---

## 2) Landing page layout

### 2.1 Goal

A “fleet” market overview:
- Nifty 50 KPI at the center (dominant)
- N100 stocks grouped sectorially around it
- Sidebar ranking by % change today

### 2.2 Desktop grid (recommended)

- Main grid: 12 columns
- Regions:
  - Left (8 cols): Nifty KPI + sector groups
  - Right (4 cols): Leaderboard sidebar (top movers)

### 2.3 Nifty KPI card

Must show:
- Index name: “Nifty 50”
- Last value
- Delta today
- % change today
- “As of” timestamp (small)

Visual treatment:
- Glitch effect for the **Last value**
- Direction determines accent:
  - Up: neon green accents
  - Down: neon red accents

### 2.4 Sector groups

For each sector:
- Sector name heading (white 72%)
- Stock pills/buttons (clickable)
  - Symbol
  - % change (with ▲/▼ + color)
  - Optional tiny sparkline later

Click behavior:
- Clicking a stock navigates to `/stock/:symbol`
- Clicking Nifty navigates to `/stock/NIFTY50`

### 2.5 Gainers / losers blocks (near Nifty KPI)

Show:
- Top 5 gainers
- Top 5 losers
Compact table-like presentation.

---

## 3) Stock detail page

### 3.1 Header section

- Symbol + name
- Sector label
- KPIs:
  - Last
  - Change
  - Change %
  - Day OHLC (optional compact)

### 3.2 Chart section

- Use a neon “oscilloscope” style chart (canvas) for intraday
- Gridlines: `--w-08`
- Line: green or red depending on day direction (or based on last vs prevClose)

### 3.3 Data integrity messaging

If intraday data missing:
- Show empty state: white text + retry
- Do not show misleading zeros

---

## 4) Interactions

### 4.1 Hover

- Borders brighten (white opacity increases)
- Optional subtle glow using `--glow-*`
- No scale “popping” (keep minimal)

### 4.2 Focus (keyboard)

- Must have a visible outline ring
- Use white ring for neutral focus
- Use red ring on invalid input states

### 4.3 Motion

- Motion is “futuristic”, but restrained:
  - ticker tape (constant)
  - subtle liquid drift in background
  - glitch flicker (only on KPI)
  - leaderboard reorder (smooth)

---

## 5) Accessibility constraints

- Never rely on color alone:
  - Use ▲/▼ and +/- signs with red/green
- Minimum touch targets:
  - 40px height for buttons / pills on mobile
- Text contrast:
  - Prefer white on black (high contrast)
  - Black text on neon-filled chips/buttons
