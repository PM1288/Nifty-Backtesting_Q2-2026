# NSE Market Learning Suite — Analytics & Dashboard Layer

This package is the **next layer** on top of the raw NSE ingestor. It assumes the raw ingestor has already created and populated the `nse` schema in PostgreSQL.

The goal of this layer is to turn raw daily files into:

- a compact **historical feature store**
- a **signal engine** for trend, reversal, delivery-conviction, event-flow, anomaly, and risk analysis
- **summary tables** for a dashboard
- **historical signal-performance** rollups for a learning platform
- agent-facing specs, checks, and acceptance criteria

## What this package adds

### Database schema
Creates schema `nse_app` with:

- `job_runs`
- `job_steps`
- `quality_check_results`
- `security_daily_features`
- `stock_analysis_signals_daily`
- `market_summary_daily`
- `signal_performance_summary`

### Dashboard
A Streamlit dashboard with:

- Overview
- Regime & Breadth
- Momentum & Breakouts
- Mean Reversion
- Delivery & Conviction
- Events & Flows
- Anomalies & Risk
- Historical Learner
- Data Quality & Jobs

### Agent guidance
You asked for supporting `.d` files so a code agent can understand what should be done and how it should be checked. This package includes:

- `AGENTS.md`
- `agent.d/00-objective.d`
- `agent.d/10-build-order.d`
- `agent.d/20-data-contracts.d`
- `agent.d/30-verification.d`
- `agent.d/40-dashboard.d`
- `agent.d/50-analysis-catalog.d`
- `agent.d/60-future-extensions.d`

These are plain UTF-8 text files with concise build and verification rules.

## Why this layer matters

The raw tables are good for ingestion and normalization. They are not ideal as the final surface for research or a dashboard. This layer creates a smaller and more stable semantic layer:

- **Raw (`nse.*`)** can stay on ~6 months retention
- **Features (`nse_app.security_daily_features`)** can stay much longer because they are compact and model-ready
- **Summary + signal-performance tables** can stay for years and power your learning platform

That means you can keep the storage footprint controlled while still preserving historical learning value.

## Recommended retention model

- Raw NSE fact tables: 190 days
- Compact feature table: 2 to 5 years
- Signal performance and market summaries: 5 years or more

If you keep only 6 months everywhere, the dashboard still works, but the historical learner becomes less reliable.

## Quick start

1. Copy `.env.example` to `.env`
2. Set `DATABASE_URL`
3. Build:
   ```bash
   docker compose build
   ```
4. Run migrations:
   ```bash
   docker compose run --rm nse_analytics_worker python -m app.cli migrate
   ```
5. Refresh all analytics tables:
   ```bash
   docker compose run --rm nse_analytics_worker python -m app.cli refresh-all
   ```
6. Run checks:
   ```bash
   docker compose run --rm nse_analytics_worker python -m app.cli run-checks
   ```
7. Start the dashboard:
   ```bash
   docker compose up nse_dashboard
   ```

## Main objects

### Feature table
`nse_app.security_daily_features`

One row per `trade_date + symbol + series` with:
- price / volume / delivery features
- rolling baselines
- event overlays
- lagged surveillance overlay
- forward returns for learning labels

### Signal table
`nse_app.stock_analysis_signals_daily`

One row per triggered signal:
- `analysis_type`
- `signal_name`
- `signal_direction`
- `signal_strength`
- rationale and forward-return outcomes

### Summary table
`nse_app.market_summary_daily`

One row per trade date:
- breadth
- breakout vs breakdown counts
- anomaly and risk counts
- event counts
- market-regime label

### Historical learner
`nse_app.signal_performance_summary`

Historical performance by signal:
- sample size
- hit-rate
- average forward returns
- median forward returns

## What historical data helps most

### Strongly improved by more history
- breakout follow-through statistics
- mean-reversion success rates
- anomaly baselines
- regime-conditioned signal performance
- seasonality / month-end / event repetition studies

### Moderately improved
- delivery-conviction studies
- short-selling and financed-crowding overlays
- announcement / board-meeting follow-through

### Works even with only ~6 months
- current dashboard snapshot
- latest signal watchlist
- market breadth
- recent anomaly detection

## Notes

- This layer expects the raw ingestor schema from the previous package to exist.
- It uses a **lagged** surveillance overlay in the feature table to avoid simple look-ahead leakage.
- The dashboard is designed to be attractive but simple to extend.
- The checks are both human-readable and code-agent-friendly.

See:
- `docs/ANALYSIS_CATALOG.md`
- `docs/HISTORICAL_DEPTH_GUIDE.md`
- `docs/CODE_AGENT_VERIFICATION.md`
- `docs/FILE_LOGGING.md`
