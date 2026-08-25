# OISS formulas

- DQ = 30% freshness + 25% completeness + 20% consistency + 15% coverage + 10% source integrity; effective DQ is the minimum of aggregate and critical inputs.
- OISS reuses canonical OIIS long/short OFactor and selected-direction XFactor.
- Extension: FRESH ≤0.5 ATR, ACCEPTABLE ≤1, MODERATE ≤1.5, EXTENDED ≤2, EXTREME >2.
- TQS = clamp(55% OFactor + 45% XFactor + extension penalty). Penalties: 0, 0, -5, -15, -30.
- Sector = 30% relative strength + 25% breadth + 25% money flow + 20% participation.
- All thresholds live in the immutable JSON-compatible YAML configuration. Missing inputs remain null.
