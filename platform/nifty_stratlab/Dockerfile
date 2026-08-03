FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app
COPY pyproject.toml README.md /app/
RUN mkdir -p /app/src/nifty_stratlab \
    && touch /app/src/nifty_stratlab/__init__.py
RUN python -m pip install --upgrade pip \
    && python -m pip install '.[postgres]'
COPY . /app
RUN python -m pip install --no-deps --force-reinstall .

ENTRYPOINT ["nifty-stratlab"]
CMD ["--help"]
