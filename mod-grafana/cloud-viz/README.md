# QiO Cloud Viz (Grafana)

This service provides the visualization layer for the QiO Cloud platform, built on top of **Grafana 12.3.1**.

For full architecture + operations documentation, see `STACK_RUNBOOK.md`.

## Features
*   **Custom Branding**: QiO logos, login screen, and page titles.
*   **Pre-installed Plugins**: Includes Volkov Labs plugins (ECharts, Form Panel, Variable Panel, etc.) for advanced visualization.
*   **Provisioning**: Dashboards and datasources are automatically provisioned from the `grafana/provisioning` directory.
*   **Security**: Runs as a non-root user (`grafana`).
*   **Observability Stack (Compose)**: Includes Prometheus + Loki + Tempo + Grafana Alloy + Grafana Image Renderer in the default `docker-compose.yml`.
*   **Branding**: Login and chrome are driven by `public/brand/brand.json` (runtime override), a new BrandContext, and a custom login experience with a visible “Source Code” AGPL link.

## Configuration
*   **Port**: 3012 (via reverse proxy)
*   **Environment Variables**:
    *   `GRAFANA_ADMIN_PASSWORD`: Admin password for local/compose runs (default `QiOPassword1#`; override in production).
    *   `GF_SECURITY_SECRET_KEY`: Optional Grafana signing secret (recommended for stable sessions).
    *   `GRAFANA_ROOT_URL`: Public URL for the service (defaults to `https://t2.qio.co.in/`).
    *   `GRAFANA_DOMAIN`: Domain for Grafana (defaults to `t2.qio.co.in`).
    *   `GA4_ID`: Google Analytics 4 ID (defaults to `G-4C2B5M6KLR`).

## Run (Docker Compose)
```bash
docker compose up --build -d
docker compose ps
```

## Branding Runtime Override
- The image ships with `public/brand/brand.json` (see `grafana/src-overrides/public/brand/brand.sample.json` for the schema).
- You can mount your own file at runtime to change product name, colors, logos, and source-code link without rebuilding:
  ```bash
  docker run -d -p 3012:3012 \
    -v $(pwd)/brand.json:/usr/share/grafana/public/brand/brand.json:ro \
    qiotech/qio-cloud-viz:local
  ```

## Demo Postgres (for testing)
The default `docker-compose.yml` starts a local Postgres container and provisions:
* `local-postgres` datasource (`grafana/provisioning/datasources/local-postgres.yaml`)
* `Dummy Postgres Dashboard` (`grafana/provisioning/dashboards/dummy-postgres.json`)

## Prometheus + Loki (Compose)
The default `docker-compose.yml` also starts:
* Prometheus (`prometheus/prometheus.yml`) and provisions a Grafana datasource at `http://prometheus:9090`
* Loki (`loki/config.yml`) and provisions a Grafana datasource at `http://loki:3100`

## Alloy + Tempo (Compose)
* Alloy UI: `http://localhost:3011/` (config: `alloy/config.alloy`)
* OTLP ingest: `localhost:4317` (gRPC) and `localhost:4318` (HTTP)
* Tempo datasource is provisioned at `http://tempo:3200`

## Configurator UI (Compose)
The default `docker-compose.yml` also starts `qio-configurator`, available at:
* `http://localhost:3012/config/`
* `http://localhost:3010/` (direct, non-standard port; configurable via `CONFIGURATOR_PORT`)

It can:
* Create/delete Grafana datasources via Grafana HTTP API.
* Manage Prometheus “devices” via file-based SD (`prometheus/targets/devices.yml`) and apply changes via `POST /-/reload`.
* Manage Alertmanager webhook receivers (`alertmanager/config.yml`) and reload via `POST /-/reload`.

## Alertmanager + Promtail (Compose)
* Alertmanager runs at `http://alertmanager:9093` (internal-only).
* Promtail runs at `http://promtail:9080` (internal-only) and accepts syslog on `${PROMTAIL_SYSLOG_PORT:-1514}` (TCP/UDP).
