# Limitations

- Governed historical OISS bootstrap begins 11 August 2026; older Yahoo daily history is not presented as equivalent intraday decision evidence.
- Current F&O membership is applied retrospectively: `SURVIVORSHIP_BIAS_POSSIBLE`.
- Point-in-time macro-event publication semantics are incomplete; the event section is DATA INSUFFICIENT rather than guessed.
- Daily outcome evaluation currently provides D+1..D+5 and daily MFE/MAE. Intraday 15/30/60 returns, target-before-stop chronology, D+1 open/high/low/close and H2–H4 detailed paths require a subsequent minute-path evaluator.
- Portfolio correlation falls back to sector concentration until a versioned point-in-time correlation source is wired.
- Scheduler and paper are intentionally disabled pending shadow validation. No live broker execution exists.
