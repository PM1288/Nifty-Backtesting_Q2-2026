# Deployment Checklist

## Build / CI
- [ ] `python -m py_compile app/*.py`
- [ ] `pytest -q`

## Runtime
- [ ] `GET /api/health` returns ok:true
- [ ] WebSocket `/ws/live` connects and pushes `snapshot` messages continuously
- [ ] Header ticker tape scrolls right-to-left
- [ ] Footer disclaimer marquee scrolls continuously

## Brand/theme compliance
- [ ] Only allowed colors used (black/white + neon red/green tokens)
- [ ] No gray hex codes (use rgba white opacity)
- [ ] LiquidBackdrop uses a single accent at a time (green OR red)
- [ ] Glitch effect only on the main KPI value

## UX (screen checks)
- [ ] Fleet shows KPI + pills + movers
- [ ] Cockpit renders Pulse/Breadth/Orb/Radar + ladder without blank canvases
- [ ] Stock detail renders oscilloscope + VWAP and does not show zeros on gaps
- [ ] Anomaly Lab shows tunnel + list
- [ ] Data Quality page shows connection state and last snapshot time
