# Hybrid Catalogue Limitations

- Catalogue prose such as “trend non-bearish”, “breadth stable”, “near support” and “volume confirms” is interpreted by `hybrid_narrative_assumptions_v1`. This is a frozen practical proxy, not proof that it matches the author's intended rule.
- D2/D3 execution uses the available NIFTY/VIX files, static sector data and current 100-symbol CSV panel. This creates survivorship and classification bias.
- The nine existing reference manifests retain their original native exits. The generated hybrid worksets override those exits for the requested comparable target-only study; an execution adapter still must enforce that override before a full run.
- The real RELIANCE smoke ran all 96 assumption-backed entry detectors and the two-stage target simulator. A zero-signal strategy remains a successful execution check, not evidence of profitability or failure.
- Costs are currently a visible research proxy: 8 bps round trip for same-day trades and 22 bps for swing/delivery trades. Exact effective-dated broker/tax reconciliation remains future work.
- Probability is `NOT_CALIBRATED`; there is no broker-order authority.
