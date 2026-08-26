# Reproducing OISS-EXPERIMENT-20260826

## Safety boundary

The experiment reads exported handoff CSVs and point-in-time market bars. It performs no INSERT,
UPDATE, DELETE, migration, scheduler change, paper intent, or broker operation.

## Tooling

```bash
cd /home/novius2/trading-stack
python3 -m venv .venv-oiss-experiment
.venv-oiss-experiment/bin/pip install -r tools/oiss_experiment_requirements.txt
```

The database extracts are produced with `COPY ... TO STDOUT` from the running PostgreSQL container.
The exact exported source files in this handoff are:

```text
output/oiss_experiment_20260826/raw/stock_bars_1m.csv
output/oiss_experiment_20260826/raw/index_bars_1m.csv
output/oiss_experiment_20260826/raw/index_bars_1d.csv
output/oiss_experiment_20260826/raw/DB_SOURCE_COVERAGE.csv
```

Run:

```bash
.venv-oiss-experiment/bin/python tools/oiss_evidence_fitness_experiment.py \
  --handoff-dir docs/strategy/oiss-v1-202608 \
  --bars-1m output/oiss_experiment_20260826/raw/stock_bars_1m.csv \
  --index-bars-1m output/oiss_experiment_20260826/raw/index_bars_1m.csv \
  --index-bars-1d output/oiss_experiment_20260826/raw/index_bars_1d.csv \
  --output output/oiss_experiment_20260826
```

## Generated analytical files

```text
01_data_availability.csv
02_gate_funnel.csv
02_gate_attribution.csv
03_gate_overlap_matrix.csv
04_status_consistency_anomalies.csv
05_opportunity_episodes.csv
06_minute_path_outcomes.csv
06_minute_path_outcomes.parquet
07_structural_rr_diagnostic.csv
08_option_selection_integrity.csv
09_horizon_component_coverage.csv
10_score_discrimination.csv
11_sector_rotation_reconstructed.csv
12_market_regime_reconstructed.csv
13_critical_index_levels_reconstructed.csv
14_threshold_sensitivity.csv
15_run_provenance_audit.csv
16_no_chase_diagnostic.csv
SUMMARY.json
MANIFEST.csv
charts/*.png
```

`MANIFEST.csv` records row counts, column counts, sizes and SHA-256 hashes. The Parquet output uses
Zstandard compression. The CSVs contain raw machine-readable values; charts are derived solely from
the corresponding generated tables.

## Interpretation constraints

- `06_minute_path_outcomes` is decision-time evidence against a planned entry, not filled-trade P&L.
- `11_sector_rotation_reconstructed`, `12_market_regime_reconstructed`,
  `13_critical_index_levels_reconstructed`, and available-component horizon scores are engineering
  diagnostics; none is an approved production OISS formula.
- Event risk remains unsafe for historical replay.
- Threshold sensitivity is not optimization.
- Repeated scans are not independent trades; use `05_opportunity_episodes.csv`.

