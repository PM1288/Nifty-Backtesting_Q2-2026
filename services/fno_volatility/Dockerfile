FROM python:3.12-slim AS build
WORKDIR /build
COPY services/fno_volatility/pyproject.toml ./
COPY services/fno_volatility/src ./src
COPY services/fno_volatility/tests ./tests
RUN pip install --no-cache-dir --prefix=/install .

FROM build AS test
RUN pip install --no-cache-dir '.[test]'
CMD ["sh", "-lc", "pytest -q tests && ruff check src tests"]

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
RUN groupadd --system app && useradd --system --gid app --home /app app
WORKDIR /app
COPY --from=build /install /usr/local
COPY services/fno_volatility/config ./config
COPY services/fno_volatility/sql ./sql
USER app
ENTRYPOINT ["fno-volatility"]
CMD ["scheduler"]
