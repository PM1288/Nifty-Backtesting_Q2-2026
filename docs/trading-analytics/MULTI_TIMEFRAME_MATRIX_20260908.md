# MANEESH synchronized 1m / 5m / 15m matrix

## Outcome

The Trading Analytics workspace now has an additive `1m · 5m · 15m` lens at:

```text
/strategy/trading-analytics?view=matrix
```

It renders one fixed desktop matrix without an interval selector:

| | Underlying | Exact selected CE | Exact selected PE |
|---|---|---|---|
| 1 minute | Candles + EMA9 | Candles + EMA9 | Candles + EMA9 |
| 5 minute | Candles + EMA9 | Candles + EMA9 | Candles + EMA9 |
| 15 minute | Candles + EMA9 | Candles + EMA9 | Candles + EMA9 |

The existing Scalper remains unchanged and is still the default MANEESH header destination. This matrix is a separate page lens for simultaneous timeframe comparison.

## Data and identity

- Reuses authenticated `GET /v1/trading-analytics/charts` for intervals `1`, `5`, and `15`.
- Uses the selected underlying plus an exact CE/PE pair with the same expiry and strike.
- Uses the latest retained IST session and completed source candles only.
- If the requested/current-chain pair has no retained history, the URL is replaced with the nearest retained exact pair; it is explicitly labelled as retained evidence and is never mixed with the current chain.
- Missing bars remain `No completed retained candles`; they are never converted to zero.
- No strategy, OIIS/OISS, paper, broker, pricing, or ingestion logic is changed.

## Cursor synchronization

Hovering any one of the nine panes publishes the source candle timestamp to the matrix. Every other pane maps that timestamp to its containing completed candle. This preserves the same wall-clock comparison across different aggregation widths instead of requiring identical bar-end timestamps.

Moving outside the chart clears the synchronized crosshair. The OHLC strip in every cell follows the same shared timestamp.

## Layout and rollback

- Desktop uses one contained `3 × 3` viewport with no browser-level scrolling at 1920×1080 and 1440×900.
- Below 1100 px, the matrix becomes one contained scroll surface rather than shrinking charts into unreadability.
- Roll back the feature by reverting the `matrix` navigation entry and `TradingAnalyticsTimeframeMatrix` render. No database or API rollback is required.

## Verification

```bash
cd /home/novius2/trading-stack/neon-stock-terminal/apps/web
npm run typecheck
npm test
npm run build

cd /home/novius2/trading-stack
node tools/playwright/trading-analytics-timeframe-matrix.mjs
```

The browser package is written to:

```text
/home/novius2/NIFTY50/UI/MANEESH_MULTI_TIMEFRAME_MATRIX_ACCEPTANCE_20260908
```

Production acceptance on 8 September 2026 passed `34/34` assertions at
1920×1080 and 1440×900. It verified nine mounted chart cells, three identities
for every interval, no interval selector, the shared cursor timestamp on all
nine panes, one-viewport geometry, no horizontal overflow, no application
runtime errors, and no serious/critical axe violations. The evidence used the
retained 8 September 2026 NIFTY `23650` CE/PE pair and kept it explicitly
separate from the 15 September current-chain context.
