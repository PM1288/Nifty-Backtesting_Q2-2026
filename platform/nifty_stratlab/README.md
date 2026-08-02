# NIFTY StratLab — Phase 1

This bounded package qualifies historical source data without modifying it.

Run the reusable qualifier from this directory:

```bash
python3 tools/qualify_historical.py --output-dir outputs/qualification
```

It writes immutable-source manifests, a quality report, and a quarantine manifest.
