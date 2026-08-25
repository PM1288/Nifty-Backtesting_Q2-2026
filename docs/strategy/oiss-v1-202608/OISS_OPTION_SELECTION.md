# Option selection

For candidates with OFactor ≥65, the engine considers only contract observations timestamped at or before the scan and no older than 15 minutes. It uses the matching CE/PE direction, nearest three strikes for the nearest available expiries, and scores spread (35%), OI rank (25%), volume rank (20%) and depth quality (20%). Hard gates are spread ≤3%, OI ≥100 and volume ≥1. The selected JSON retains bid, ask, spread, OI, volume, delta, lot, quote time, quality and reason. No passing contract produces explicit DATA_INSUFFICIENT; no contract is fabricated.
