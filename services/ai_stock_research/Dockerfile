FROM python:3.12-slim AS builder
WORKDIR /build
COPY services/ai_stock_research/pyproject.toml /build/services/ai_stock_research/pyproject.toml
COPY services/ai_stock_research/src /build/services/ai_stock_research/src
RUN pip install --no-cache-dir --prefix=/install /build/services/ai_stock_research

FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
RUN groupadd --system --gid 10001 airesearch \
  && useradd --system --uid 10002 --gid airesearch --home /app airesearch
WORKDIR /app
COPY --from=builder /install /usr/local
COPY services/ai_stock_research/prompts /app/prompts
USER airesearch
ENTRYPOINT ["ai-stock-research"]
CMD ["run"]
