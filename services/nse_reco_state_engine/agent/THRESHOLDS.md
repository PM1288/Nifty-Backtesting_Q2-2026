# Thresholds & scoring approach

All thresholds live in `config/reco_thresholds.yml`.

## Engine structure

A. **Regime model** decides market state:
- broad bullish expansion
- broad bearish expansion
- mixed rotation
- high-volatility chop
- low-volatility compression
- uncertain

B. **Signal model** scores stock setups:
- breakout continuation
- quiet accumulation
- mean reversion
- breakdown risk
- squeeze watch
- event watch

C. **Action model** converts `(regime + signal + edge - penalties)` to:
- buy_now
- wait_for_pullback
- watch_only
- avoid_despite_strength
- anomaly_review_required

## Final score

```
final_score = base
  + regime_fit
  + signal_quality_weight*(signal_quality - base)
  + historical_edge_weight*(historical_edge)
  - risk_penalty
  - anomaly_penalty
```

- `signal_quality` is 0..100 (computed from residual strength + VWAP + volume + path quality)
- `regime_fit`, `historical_edge`, `risk_penalty`, `anomaly_penalty` are points

## Production rules

- clamp scores to 0..100
- if severe anomalies exist and `force_anomaly_review_on_severe=true`, action is overridden
