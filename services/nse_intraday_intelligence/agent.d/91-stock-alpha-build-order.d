Build order:
1. apply SQL migrations 060/061/062
2. replace pipeline.py
3. run install_sql if not already run
4. refresh features for several historical dates so beta and minute-volume baselines populate
5. refresh dashboard and watchlists
6. verify section `stock-quality` and enriched stock payloads