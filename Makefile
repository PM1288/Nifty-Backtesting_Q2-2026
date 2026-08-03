PYTHON ?= python
BASE_URL ?= http://localhost:19090
COMPOSE_ENV ?= --env-file .env
COMPOSE_BASE ?= docker compose $(COMPOSE_ENV) -f compose/compose.base.yml
COMPOSE_CORE ?= $(COMPOSE_BASE) -f compose/compose.core.yml
COMPOSE_STAGE ?= $(COMPOSE_BASE) -f compose/compose.stage.yml
COMPOSE_TELEMETRY ?= $(COMPOSE_BASE) -f compose/compose.telemetry.yml
COMPOSE_JOBS ?= $(COMPOSE_BASE) -f compose/compose.jobs.yml
COMPOSE_LEGACY ?= $(COMPOSE_BASE) -f compose/compose.legacy.yml
COMPOSE_DEV ?= $(COMPOSE_BASE) -f compose/compose.dev.yml

.PHONY: compose-lint image-report route-smoke route-smoke-core warmup-probe baseline baseline-up build-benchmark-core build-benchmark-core-nocache core-config core-up core-down core-mount-report stage-config telemetry-config jobs-config legacy-config dev-config nifty-stratlab-test nifty-stratlab-smoke nifty-stratlab-test-migrations

compose-lint:
	$(PYTHON) scripts/verify/compose_lint.py

image-report:
	$(PYTHON) scripts/verify/image_report.py

route-smoke:
	$(PYTHON) scripts/verify/route_smoke.py --base-url $(BASE_URL)

route-smoke-core:
	$(PYTHON) scripts/verify/route_smoke.py --base-url $(BASE_URL) --surface core

warmup-probe:
	$(PYTHON) scripts/verify/warmup_probe.py --base-url $(BASE_URL) --path /n50/

baseline:
	$(PYTHON) scripts/verify/baseline.py --base-url $(BASE_URL)

baseline-up:
	$(PYTHON) scripts/verify/baseline.py --bring-up --base-url $(BASE_URL)

build-benchmark-core:
	$(PYTHON) scripts/verify/build_benchmark.py --surface core --services nse_ingestor nse-analytics-worker nse-orchestrator nse-export-api nse-intraday-api nse-intraday-scheduler nse-reco-api nse-reco-scheduler market-data-gateway option-chain-watcher n50-dashboard

build-benchmark-core-nocache:
	$(PYTHON) scripts/verify/build_benchmark.py --surface core --no-cache --services nse_ingestor nse-analytics-worker nse-orchestrator nse-export-api nse-intraday-api nse-intraday-scheduler nse-reco-api nse-reco-scheduler market-data-gateway option-chain-watcher n50-dashboard

core-config:
	$(COMPOSE_CORE) config

core-up:
	$(COMPOSE_CORE) up -d

core-down:
	$(COMPOSE_CORE) down

core-mount-report:
	$(PYTHON) scripts/verify/mount_report.py --surface core

stage-config:
	$(COMPOSE_STAGE) config

telemetry-config:
	$(COMPOSE_TELEMETRY) config

jobs-config:
	$(COMPOSE_JOBS) config

legacy-config:
	$(COMPOSE_LEGACY) config

dev-config:
	$(COMPOSE_DEV) config

nifty-stratlab-test:
	./scripts/nifty_stratlab_test.sh

nifty-stratlab-smoke:
	./scripts/nifty_stratlab_test.sh --smoke-only

nifty-stratlab-test-migrations:
	./scripts/nifty_stratlab_migrate_test.sh
