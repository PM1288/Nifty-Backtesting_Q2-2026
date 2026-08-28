# Today revamp component map

The feature extends the shared `AppShell`, `StockLogo`, canonical formatters, React Query hooks and Lucide icon system. It adds `TodaySummaryPage`, `TodayFullBoardPage`, `MarketSummaryStrip`, `SectorRankingPanel`/matrix compositions, a custom sector-group virtual viewport, compact stock tiles and one portal quick-view surface. No parallel API client, polling owner, chart library or design system was introduced.

The legacy `LandingPage` remains the rollback implementation. `VITE_TODAY_SUMMARY_DETAIL_V1=true` selects the new pages.
