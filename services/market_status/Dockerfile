FROM python:3.12-slim AS builder
ENV PIP_DISABLE_PIP_VERSION_CHECK=1 PIP_NO_CACHE_DIR=1
WORKDIR /build
COPY services/market_status/pyproject.toml ./pyproject.toml
COPY services/market_status/src ./src
RUN python -m venv /venv && /venv/bin/pip install --no-cache-dir .

FROM python:3.12-slim AS runtime
ENV PATH=/venv/bin:$PATH PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
RUN groupadd --system --gid 10002 marketstatus && \
    useradd --system --uid 10002 --gid marketstatus --home /app marketstatus
COPY --from=builder /venv /venv
WORKDIR /app
COPY --chown=marketstatus:marketstatus schemas/market-status-whatsapp.v1.schema.json /app/schemas/market-status-whatsapp.v1.schema.json
USER 10002:10002
