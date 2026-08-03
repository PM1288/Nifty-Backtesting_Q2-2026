# Future modules (planned)

This repo includes placeholders and architectural notes for later additions.

---

## 1) Backtesting / strategy reports

Recommended approach:
- Add a `strategies` table and `backtest_runs` table
- Store:
  - parameters
  - results summary
  - equity curve (time series)
  - trade log

UI:
- `/backtests`
- `/backtests/:id`

Palette constraints remain:
- Use only red/green/white/black
- Distinguish win/loss by green/red
- Use signs/arrows, not color alone

---

## 2) Watchlists

DB:
- `users` (optional auth)
- `watchlists`
- `watchlist_items`

UI:
- watchlist drawer / page
- integrate into ticker tape “pinned symbols”

---

## 3) Screeners

Keep minimalist:
- a single table
- filters as compact chips
- results export (CSV)
