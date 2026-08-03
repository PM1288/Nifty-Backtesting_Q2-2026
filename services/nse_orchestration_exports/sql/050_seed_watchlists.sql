insert into nse_ops.watchlist (slug, title, description, watchlist_kind, rule_key, selection_limit, ui_rank)
values
  ('leaders', 'Leaders', 'Strongest daily movers in the current session summary', 'system', 'leaders', 20, 10),
  ('laggards', 'Laggards', 'Weakest daily movers in the current session summary', 'system', 'laggards', 20, 20),
  ('breakouts', 'Breakouts', 'Momentum and breakout names with strong confirmation', 'system', 'breakouts', 20, 30),
  ('mean-reversion', 'Mean Reversion', 'Potential oversold/overextended reversal candidates', 'system', 'mean_reversion', 20, 40),
  ('high-delivery', 'High Delivery', 'High-conviction delivery-led names', 'system', 'high_delivery', 20, 50),
  ('events-flow', 'Events & Flow', 'Bulk/block/event-driven names', 'system', 'events_flow', 20, 60),
  ('anomalies', 'Anomalies', 'Symbols with unusual activity requiring review', 'system', 'anomalies', 20, 70),
  ('risk-caution', 'Risk & Caution', 'Names with risk/caution overlays or adverse signal mix', 'system', 'risk_caution', 20, 80)
on conflict (slug) do nothing;
