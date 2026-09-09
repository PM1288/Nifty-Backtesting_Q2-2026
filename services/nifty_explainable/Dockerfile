FROM python:3.12-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY constraints.txt .
RUN pip install --no-cache-dir -r requirements.txt -c constraints.txt
COPY worker.py trade_quality.py schema.sql ./
ENV OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1
CMD ["python", "worker.py", "capture-loop"]
