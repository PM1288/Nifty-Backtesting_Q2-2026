FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates tzdata \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --upgrade pip 'setuptools>=83.0.0' && pip install -r requirements.txt

COPY app ./app
COPY scripts ./scripts

CMD ["python", "scripts/scheduler.py"]

# Runtime images are immutable: keep installers in build/test environments only.
RUN apt-get update && apt-get upgrade -y --no-install-recommends \
    && rm -rf /var/lib/apt/lists/* \
    && for interpreter in /opt/venv/bin/python /venv/bin/python /usr/local/bin/python; do \
         if [ -x "$interpreter" ]; then "$interpreter" -m pip uninstall -y setuptools wheel pip; fi; \
       done \
    && rm -rf /usr/local/lib/python*/ensurepip
