FROM python:3.11-slim AS builder

ENV PIP_NO_CACHE_DIR=1 \
    VIRTUAL_ENV=/opt/venv \
    PATH="/opt/venv/bin:${PATH}"

WORKDIR /app

RUN python -m venv "${VIRTUAL_ENV}"
COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -U pip && pip install -r requirements.txt

FROM python:3.11-slim AS runtime

ENV PORT=8000 \
    VIRTUAL_ENV=/opt/venv \
    PATH="/opt/venv/bin:${PATH}"

WORKDIR /app

COPY --from=builder /opt/venv /opt/venv
COPY app.py .

EXPOSE 8000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
