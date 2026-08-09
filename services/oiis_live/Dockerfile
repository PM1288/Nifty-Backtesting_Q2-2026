FROM python:3.12-slim AS builder
WORKDIR /build
COPY services/oiis_live/pyproject.toml /build/services/oiis_live/pyproject.toml
COPY services/oiis_live/src /build/services/oiis_live/src
RUN pip install --no-cache-dir --prefix=/install /build/services/oiis_live

FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=/app/nifty_stratlab
RUN groupadd --system oiis && useradd --system --gid oiis --home /app oiis
WORKDIR /app
COPY --from=builder /install /usr/local
COPY services/oiis_live/config /app/config
COPY platform/nifty_stratlab/src/nifty_stratlab /app/nifty_stratlab/nifty_stratlab
USER oiis
ENTRYPOINT ["oiis-live"]
CMD ["run"]
