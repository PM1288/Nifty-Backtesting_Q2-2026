# Tools

The tools provide phase smoke tests, schema/golden-vector generation, and bounded
workbook inspection. `inspect_workbook.py` samples only the configured number of
rows per sheet and does not process the full workbook.

`import_strategy_evaluation_roe.py` validates and ingests the controlled event
workbook, calculates shifted stock/index regime labels, and applies independent
rankability gates to the latest published portfolio runs. Use `--dry-run` first;
the command is transactional and idempotent.

`export_strategy_evaluation_pack.py` exports one evaluated strategy/scenario to
the exact 24-sheet governed workbook, CSV evidence, Markdown/JSON summaries and
SHA-256 checksums. It also records each artifact in
`strategy_eval.artifact_manifest`.

`qualify_sources.py` requires explicit source paths. It intentionally has no default
root scan, preventing an accidental full-estate run.

`run_rsi_intraday_backtest.py` accepts exactly one explicit minute CSV plus start
and end dates. It scans that file in chunks, retains only the bounded evaluation
and warm-up range, computes prior-completed-day RSI without look-ahead, runs the
RSI 30/70 strategy, and writes CSV, JSON, Markdown, checksummed manifest, and a
verified research-pack ZIP. It never creates broker orders.

`verify_rsi_backtest.py OUTPUT_DIR` verifies every loose-file hash, all observed
entry/exit thresholds, allowed exit reasons, and the research-pack ZIP checksums.

`run_rsi15_daily40_backtest.py` is the review-ready bounded runner for the frozen
RSI15/Daily40 contract. It uses exact SMA-seeded Wilder RSI, the prior completed
daily session, next-minute-open fills, one trade per symbol/day, a 14:45 entry
cut-off, and a 15:15 forced-exit decision. Its HTML report embeds links to three
dependency-free SVG charts. Use `../scripts/run_rsi15_daily40.sh` rather than
memorising Python paths.
