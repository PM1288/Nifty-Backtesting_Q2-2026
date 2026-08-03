.PHONY: bootstrap daily verify discover test docker-bootstrap docker-daily docker-verify

bootstrap:
	python scripts/bootstrap_backfill.py

daily:
	python scripts/run_daily.py

verify:
	python scripts/verify_completeness.py

discover:
	python scripts/discover_sources.py

test:
	pytest

docker-bootstrap:
	docker compose run --rm --profile institutional-flow institutional-flow-ingest python scripts/bootstrap_backfill.py

docker-daily:
	docker compose run --rm --profile institutional-flow institutional-flow-ingest python scripts/run_daily.py

docker-verify:
	docker compose run --rm --profile institutional-flow institutional-flow-ingest python scripts/verify_completeness.py
