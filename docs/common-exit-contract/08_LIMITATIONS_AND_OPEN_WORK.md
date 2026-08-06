# Limitations and Open Work

The common target-only exit is implemented, but the wider Rules-of-Engagement
programme is not complete.

- OIIS is still a current-panel, isolated-symbol Phase-A study. The ₹16 lakh,
  eight-position parent allocator and unlimited-capacity scenario must be run
  through a common chronological portfolio event stream.
- OIIS entry features use canonical EOD facts while exits use one-minute CSV.
  Minute sessions are normalised to EOD open basis. Positions spanning a
  corporate action still require explicit quantity/target adjustment from the
  effective-dated corporate-action table before ranking.
- The 8/22 bps total-cost values are research proxies, not a certified
  effective-dated Indian brokerage/statutory/DP/slippage schedule.
- Open positions currently report marked liquidation value, MFE/MAE and adverse
  touches, but the complete Rules fields for time underwater, recovery time and
  capital-days still require full materialisation.
- The common module emits target/adverse evidence; dedicated relational target
  and adverse tables should replace JSON-only OIIS storage for large comparison
  queries.
- D+1 through D+5 resolution, monthly/yearly consistency, benchmark/control,
  sector index, event windows, P-Diagram, walk-forward, multiple-testing and
  calibrated-probability evidence remain required for a rankable conclusion.
- Dashboard consumers must explicitly separate realised closed-book P&L from
  open net-liquidation exposure and block incompatible policy comparisons.
- Existing non-catalogue Go backtests include independent stop/exit logic. They
  are not automatically part of this common comparative research league and
  require strategy-by-strategy migration rather than an unsafe global live-
  trading change.

No broker-order code or live execution authority was added.
