FROM python:3.10-slim

# Prevent Python from creating .pyc files
# and make logs appear immediately in Docker.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .

RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# Copy application source code
COPY *.py ./

# Create persistent directories
RUN mkdir -p /app/data \
    /app/logs \
    /app/checkpoints \
    /app/state

HEALTHCHECK --interval=30s --timeout=10s --start-period=5m --retries=3 \
    CMD ["python", "healthcheck.py"]

# Persistent scheduler: startup run, then weekdays at 07:00 IST.
CMD ["python", "scheduler.py"]
