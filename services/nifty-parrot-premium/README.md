# NIFTY Tree MVP (React + Node)

This is an MVP implementation of the **Tree Market Visual**:

- **Tree** in the center
- **Each branch = a sector**
- **Each leaf = a NIFTY100 stock**
  - Leaf **color** = day % change (red ↔ yellow ↔ green)
  - Leaf **size** = magnitude of move (bounded)
- **Sun** = NIFTY50 today (moves left→right across session; size/color map to % change)
- **Wind** = VIX (controls sway)
- **Water level** = NIFTY RSI (30–70 mapped to height)
- **Waves** = volatility (computed from last points of NIFTY intraday)
- **Backdrop** = faint heatmap of NIFTY100 RSI (30–70)

> Data is dummy right now, served by the Node API, but the data shapes are realistic and easy to replace.

## Run

```bash
npm install
npm run dev
```

Client: http://localhost:5173
Server: http://localhost:5174

## API

`GET /api/dashboard?mins=120`

Returns:
- session open/close times and `t` (0..1)
- nifty50 value + changePct + intraday series
- vix value
- niftyRsi
- n100 sectors + stocks
- rsiHeatmap (symbols × minutes)

## Where the visualization is

`client/src/components/TreeCanvas.tsx`

This is a single canvas renderer with:
- deterministic layout for branches/leaves
- hit testing for hover tooltips
- wind sway (VIX × slider)
- sun trail + water waves + background heatmap
