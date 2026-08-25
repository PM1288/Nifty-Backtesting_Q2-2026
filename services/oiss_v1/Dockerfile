FROM python:3.12-slim AS builder
WORKDIR /build
COPY services/oiss_v1/pyproject.toml /build/services/oiss_v1/pyproject.toml
COPY services/oiss_v1/src /build/services/oiss_v1/src
RUN pip install --no-cache-dir --prefix=/install /build/services/oiss_v1

FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
RUN groupadd --system oiss && useradd --system --gid oiss --home /app oiss
WORKDIR /app
COPY --from=builder /install /usr/local
COPY services/oiss_v1/config /app/config
USER oiss
ENTRYPOINT ["oiss-v1"]
CMD ["scheduler"]
