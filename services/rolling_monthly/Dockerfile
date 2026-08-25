FROM python:3.12-slim AS builder
WORKDIR /build
COPY services/rolling_monthly/pyproject.toml /build/services/rolling_monthly/pyproject.toml
COPY services/rolling_monthly/src /build/services/rolling_monthly/src
RUN pip install --no-cache-dir --prefix=/install /build/services/rolling_monthly

FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
RUN groupadd --system rollingmonthly && useradd --system --gid rollingmonthly --home /app rollingmonthly
WORKDIR /app
COPY --from=builder /install /usr/local
COPY services/rolling_monthly/config /app/config
USER rollingmonthly
ENTRYPOINT ["rolling-monthly"]
CMD ["daemon"]
