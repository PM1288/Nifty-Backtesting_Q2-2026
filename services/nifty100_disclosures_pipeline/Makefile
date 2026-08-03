.PHONY: test api extract run-all load

test:
	pytest -q

api:
	uvicorn nifty100_pipeline.api:app --host 0.0.0.0 --port 8000

extract:
	python -m nifty100_pipeline.cli extract

run-all:
	python -m nifty100_pipeline.cli run-all

load:
	python -m nifty100_pipeline.cli load-postgres
