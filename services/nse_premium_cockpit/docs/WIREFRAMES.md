# Wireframes (Screen-by-screen)

All pages share global chrome:
- Header 56px with ticker tape (R→L)
- Footer 44px with disclaimer marquee
- Pure black canvas + LiquidBackdrop (single accent)

## 1) Fleet Overview (/#/)
Grid: 12 columns

Left (8 cols)
- Nifty KPI (dominant, glitch on Last)
- Mini Breadth canvas
- Symbol pills cluster (click → /#/stock/:symbol)

Right (4 cols)
- Top movers list (smooth reorder FLIP)

## 2) Market Cockpit (/#/cockpit)
Row 1 (12 cols)
- Market Pulse Ribbon (Canvas, 120px)

Row 2
- Breadth River (4 cols, Canvas 260px)
- Leader Rotation Orb (5 cols, Canvas 260px)
- Regime Radar (3 cols, Canvas 260px)

Row 3 (12 cols)
- Signal Ladder (6 lanes, DOM)

## 3) Stock Detail (/#/stock/:symbol)
Row 1 (12 cols)
- Symbol + name + KPIs (glitch on Last)

Row 2
- Oscilloscope chart (8 cols, Canvas 360px)
- Setup Panel (4 cols)

## 4) Anomaly Lab (/#/anomaly)
Row 1 (12 cols)
- Anomaly Tunnel (Canvas 240px)

Row 2
- Top anomalies table (6 cols)
- Interpretation panel (6 cols)

## 5) Strategy (/#/strategy)
- regime label + learning roadmap

## 6) Data Quality (/#/data)
- connection status + non-misleading integrity guidance
