# Horizon rules

BTST/STBT, H2, H3 and H4 use the requested weights in `engine.py`. Inputs are mapped only from point-in-time OFactor/XFactor component evidence. BTST is long-only, STBT short-only. H4 requires 85 and deliberately returns none frequently. DQ outside A/B or EXTREME extension disables qualification. Outputs include score, state and all component inputs.
