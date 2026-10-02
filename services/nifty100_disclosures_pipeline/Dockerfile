FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

COPY pyproject.toml README.md ./
COPY src ./src
COPY .env.example ./.env.example
COPY pytest.ini ./pytest.ini

RUN pip install --no-cache-dir -e .

EXPOSE 8000

CMD ["uvicorn", "nifty100_pipeline.api:app", "--host", "0.0.0.0", "--port", "8000"]

# Runtime images are immutable: keep installers in build/test environments only.
RUN apt-get update && apt-get upgrade -y --no-install-recommends \
    && rm -rf /var/lib/apt/lists/* \
    && for interpreter in /opt/venv/bin/python /venv/bin/python /usr/local/bin/python; do \
         if [ -x "$interpreter" ]; then "$interpreter" -m pip uninstall -y setuptools wheel pip; fi; \
       done \
    && rm -rf /usr/local/lib/python*/ensurepip
