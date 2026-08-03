# syntax=docker/dockerfile:1.7
FROM python:3.12-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    VIRTUAL_ENV=/opt/venv \
    PATH="/opt/venv/bin:${PATH}"

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends bash build-essential curl ca-certificates tzdata \
    && rm -rf /var/lib/apt/lists/*

RUN python -m venv "${VIRTUAL_ENV}"

COPY nse_orchestration_exports/requirements.txt /tmp/requirements/orchestration.txt
COPY nse_ingestor/requirements.txt /tmp/requirements/nse_ingestor.txt
COPY nse_analytics_worker/requirements.txt /tmp/requirements/nse_analytics_worker.txt

RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --upgrade pip \
    && pip install \
        -r /tmp/requirements/orchestration.txt \
        -r /tmp/requirements/nse_ingestor.txt \
        -r /tmp/requirements/nse_analytics_worker.txt

FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    VIRTUAL_ENV=/opt/venv \
    PATH="/opt/venv/bin:${PATH}" \
    PYTHONPATH=/app/src

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends bash curl ca-certificates tzdata \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /opt/venv /opt/venv

COPY nse_orchestration_exports/README.md /app/README.md
COPY nse_orchestration_exports/src /app/src
COPY nse_orchestration_exports/sql /app/sql
COPY nse_orchestration_exports/docs /app/docs
COPY nse_orchestration_exports/contracts /app/contracts
COPY nse_orchestration_exports/agent.d /app/agent.d
COPY nse_orchestration_exports/scripts /app/scripts

COPY nse_ingestor/requirements.txt /app/vendor/nse_ingestor/requirements.txt
COPY nse_ingestor/app /app/vendor/nse_ingestor/app
COPY nse_ingestor/config /app/vendor/nse_ingestor/config
COPY nse_ingestor/sql /app/vendor/nse_ingestor/sql

COPY nse_analytics_worker/requirements.txt /app/vendor/nse_analytics_worker/requirements.txt
COPY nse_analytics_worker/app /app/vendor/nse_analytics_worker/app
COPY nse_analytics_worker/config /app/vendor/nse_analytics_worker/config
COPY nse_analytics_worker/sql /app/vendor/nse_analytics_worker/sql

RUN mkdir -p /var/lib/nse/exports

EXPOSE 8091
