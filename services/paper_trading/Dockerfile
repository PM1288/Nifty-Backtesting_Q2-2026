FROM python:3.12-slim AS builder
ENV PIP_DISABLE_PIP_VERSION_CHECK=1 PIP_NO_CACHE_DIR=1
WORKDIR /build
COPY pyproject.toml requirements.lock ./
RUN python -m venv /venv && /venv/bin/pip install --no-cache-dir -r requirements.lock
COPY src ./src
RUN /venv/bin/pip install --no-cache-dir .

FROM python:3.12-slim AS runtime
ENV PATH=/venv/bin:$PATH PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
RUN groupadd --system --gid 10001 paper && useradd --system --uid 10001 --gid paper --home /app paper
COPY --from=builder /venv /venv
WORKDIR /app
COPY --chown=paper:paper migrations ./migrations
COPY --chown=paper:paper alembic.ini ./alembic.ini
COPY --chown=paper:paper alembic ./alembic
COPY --chown=paper:paper schemas ./schemas
COPY --chown=paper:paper examples ./examples
USER 10001:10001
EXPOSE 8088
ENTRYPOINT ["papertrade"]
CMD ["api"]
