# QiO Foresight™ Observability Stack — Runbook

This workspace contains the **QiO Cloud Viz stack**:
- Grafana (custom branded) + Prometheus + Loki + Tempo + Grafana Alloy + Alertmanager + Promtail + Grafana Image Renderer + Configurator UI.

This runbook documents the “why” and “how” so another engineer/agent can pick it up without reverse‑engineering the repo.

---

## Quick Access

### Cloud Viz (this machine)
- Grafana (via proxy): `http://<host>:3012/`
- Configurator (via proxy): `http://<host>:3012/config/`
- Configurator (direct/non-standard port): `http://<host>:3010/`
- Promtail syslog ingestion: `<host>:1514` (TCP/UDP; use TCP for `logger`)
- Alloy UI + debug: `http://<host>:3011/` (metrics: `http://<host>:3011/metrics`)
- OTLP ingest (Alloy): `<host>:4317` (gRPC) and `<host>:4318` (HTTP)

Example (current host):
- `http://10.3.21.208:3012/config/health`
- `http://10.3.21.208:3010/health`

---

## Compose Topology (Cloud Viz)

Primary compose files:
- Dev/build from source: `docker-compose.yml`
- Production image tags: `docker-compose.prod.yml`

Reverse proxy routing:
- `/` → Grafana (`qio-cloud-viz`)
- `/config/` → Configurator (`qio-configurator`)

Routing + global CORS headers are implemented in `nginx/default.conf`.

### Services (what runs)

| Service | Container | Purpose | Host Ports | Key Config / Data |
|---|---|---|---|---|
| `proxy` | `qio-cloud-viz-proxy` | Single entrypoint + routing + CORS | `3012:80` | `nginx/default.conf` |
| `qio-cloud-viz` | `qio-cloud-viz` | Grafana 12.x (custom branded) | (internal `3012`) | Dockerfile: `dockerfile_qio-cloud-viz`, assets in `grafana/`, volume `grafana_data` |
| `grafana-renderer` | `qio-cloud-viz-renderer` | Grafana image rendering | (internal `8081`) | No config (Grafana points to it) |
| `prometheus` | `qio-cloud-viz-prometheus` | Metrics store + alert rules | (internal `9090`) | `prometheus/prometheus.yml`, `prometheus/targets/`, `prometheus/rules/`, volume `prometheus_data` |
| `loki` | `qio-cloud-viz-loki` | Logs store | (internal `3100`) | `loki/config.yml`, volume `loki_data` |
| `tempo` | `qio-cloud-viz-tempo` | Traces store (Tempo) | (internal `3200`, `4317`, `4318`) | `tempo/config.yml`, volume `tempo_data` |
| `alloy` | `qio-cloud-viz-alloy` | Collector (docker logs + OTLP traces + optional metrics push) | `3011:12345`, `4317:4317`, `4318:4318` | `alloy/config.alloy`, volume `alloy_data` |
| `promtail` | `qio-cloud-viz-promtail` | Syslog → Loki (runtime reload) | `1514:1514` TCP/UDP | `promtail/config.yml`, volume `promtail_positions` |
| `alertmanager` | `qio-cloud-viz-alertmanager` | Alert routing + receivers | (internal `9093`) | `alertmanager/config.yml`, volume `alertmanager_data` |
| `postgres` | `qio-cloud-viz-postgres` | Demo datasource | (internal `5432`) | volume `postgres_data` |
| `qio-configurator` | `qio-cloud-viz-configurator` | UI to manage datasources/devices/alerts + reload | `3010:8080` | `qio-configurator/server.py`, volumes `./prometheus`, `./alertmanager`, `./promtail` |
| `node_exporter` | `qio-cloud-viz-node-exporter` | Host metrics exporter (optional) | (none) | enabled via compose profile `exporters` |
| `cadvisor` | `qio-cloud-viz-cadvisor` | Container metrics exporter (optional) | (none) | enabled via compose profile `exporters` |

Resource limits and bounded logs:
- All services in `docker-compose.yml` include `cpus`, `mem_limit`, and `logging.options.max-size/max-file`.
- Prometheus disk usage is bounded via `--storage.tsdb.retention.time=${PROMETHEUS_RETENTION_TIME:-15d}`.

---

## Configuration Knobs (Environment Variables)

You can pass these via shell environment or a `.env` file (not committed).

### Entry point / ports
- `CONFIGURATOR_PORT` (default `3010`): maps `qio-configurator` host port.
- `PROMTAIL_SYSLOG_PORT` (default `1514`): syslog ingestion port (TCP/UDP) for Promtail.
- `ALLOY_UI_PORT` (default `3011`): maps Alloy UI (`12345`) to the host.
- `ALLOY_OTLP_GRPC_PORT` (default `4317`): exposes Alloy OTLP gRPC receiver.
- `ALLOY_OTLP_HTTP_PORT` (default `4318`): exposes Alloy OTLP HTTP receiver.

### Grafana
- `GRAFANA_ADMIN_PASSWORD`: Grafana admin password (also used by configurator; default `QiOPassword1#` for local builds—override in production).
- `GF_SECURITY_SECRET_KEY`: Grafana signing secret (recommended for stable sessions).
- `GRAFANA_DOMAIN` (default `t2.qio.co.in`)
- `GRAFANA_ROOT_URL` (default `https://t2.qio.co.in/`)
- `GRAFANA_SERVE_FROM_SUB_PATH` (default `false`)
- `GA4_ID` (default `G-4C2B5M6KLR`): enables Grafana’s built-in GA4 support via `GF_ANALYTICS_GOOGLE_ANALYTICS_4_ID`.
- `PROMETHEUS_RETENTION_TIME` (default `15d`)

### Production image tags (`docker-compose.prod.yml`)
- `QIO_CLOUD_VIZ_TAG` (default `latest`)
- `QIO_CONFIGURATOR_TAG` (default `latest`)

---

## Start / Stop (Cloud Viz)

### Dev build (local Dockerfile builds)
From repo root:
```bash
docker compose up -d --build
docker compose ps
```

### Production images (tag-based)
```bash
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml ps
```

### Stop (keep volumes)
```bash
docker compose down
```

### Reset everything (DESTROYS volumes/data)
```bash
docker compose down -v
```

---

## Grafana Branding/Theming (Robust Strategy)

Grafana OSS **v12.3.1** is rebuilt from source during the Docker build. Overrides live under `grafana/src-overrides` and assets under `grafana/img` / `grafana/css`.

Key pieces:
1) **BrandContext + runtime `brand.json`**: `public/app/branding/*` loads `/public/brand/brand.json` (per-tenant host mapping). A sample is baked in (`public/brand/brand.sample.json`) and copied to `brand.json` by default.
2) **Custom login + AGPL link**: `LoginLayout` and `Branding` were rewritten with a two-column hero layout, QiO assets, and a visible “Source Code (AGPL)” link pulled from brand config.
3) **Asset replacement**: `brand-mark.svg` replaces all Grafana icon/typelogo assets (including hashed files under `/public/build/static/img`). Favicons and CSS are copied from `grafana/img` and `grafana/css`.
4) **Custom CSS**: `public/css/custom.css` is injected via `public/views/index.html` during the Docker build for consistent theming across screens.
5) **Changing brands**: Mount `/usr/share/grafana/public/brand/brand.json` at runtime or rebuild with `--build-arg PRODUCT_NAME="New Brand"` if you also want a different default `<title>`.

---

## Reverse Proxy + Global CORS

`nginx/default.conf` is the single ingress point and adds:
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET,POST,PUT,PATCH,DELETE,OPTIONS`
- `Access-Control-Allow-Headers: Authorization,Content-Type,Accept,Origin,X-Requested-With`
- `OPTIONS` requests return `204`

Important notes:
- `Access-Control-Allow-Origin: *` is not compatible with credentialed cross-origin requests. If you need cookies across origins, switch to an explicit allowlist and add `Access-Control-Allow-Credentials: true`.
- Grafana Live origins are also opened via `GF_LIVE_ALLOWED_ORIGINS="*"` in compose.

Nginx also uses Docker DNS re-resolution:
- `resolver 127.0.0.11 valid=10s ipv6=off;`
This prevents `502 Bad Gateway` after container re-create due to cached upstream IPs.

---

## Configurator UI (Grafana + Prometheus + Loki + Alerting)

Purpose:
- A simple UI to configure the stack **without container restarts** (unless unavoidable).

Access:
- Via proxy: `http://<host>:3012/config/`
- Direct: `http://<host>:3010/` (set via `CONFIGURATOR_PORT`)

Key capabilities:
- **Grafana datasources**: create/delete via Grafana HTTP API.
- **Prometheus devices**: manage file-based service discovery in `prometheus/targets/devices.yml`, then call `POST /-/reload` on Prometheus.
- **Alerting**:
  - manage `alertmanager/config.yml` receivers (webhook)
  - manage simple Prometheus rules in `prometheus/rules/generated.yml`
  - reload Alertmanager + Prometheus via their reload endpoints
- **Promtail**: reloads via `POST /reload`

Why the UI links are “path-only”:
- `qio-configurator/templates/*` use `request.url_for(...).path` so the UI works the same behind:
  - direct access (`http://host:3010/`)
  - reverse proxy (`https://domain/config/`)
  - TLS termination

---

## Prometheus / Loki / Alertmanager / Promtail Notes

### Prometheus
Config: `prometheus/prometheus.yml`
- `job_name: devices` uses `file_sd_configs`:
  - `prometheus/targets/devices.yml` is the primary managed file.
- Rules loaded from: `prometheus/rules/*.yml`
- Reload endpoint enabled: `--web.enable-lifecycle` (so `POST /-/reload` works)
- Remote-write receiver enabled in compose via `--enable-feature=remote-write-receiver` (Alloy pushes to `http://prometheus:9090/api/v1/write`).

Example `prometheus/targets/devices.yml`:
```yaml
- targets:
  - "10.3.21.223:9100"
  labels:
    device: "vm-223"
    role: "node-exporter"
```

### Loki
Config: `loki/config.yml`
- Simple single-binary config with filesystem storage under `/loki` (volume `loki_data`).

### Tempo
Config: `tempo/config.yml`
- Single-binary Tempo with local storage under `/var/tempo` (volume `tempo_data`).
- OTLP receivers enabled (gRPC `4317`, HTTP `4318`) for ingestion from Alloy.

### Promtail
Config: `promtail/config.yml`
- Receives syslog on `0.0.0.0:1514` and labels logs with `host` extracted from syslog metadata.
- When using Linux `logger`, force TCP to avoid UDP-only sends:
  - `logger -n <this-host> -P 1514 -T "hello from device"`
- Reload endpoint: `POST /reload`

### Alloy
Config: `alloy/config.alloy`
- Docker logs → Loki with labels `job=docker`, `stack=qio-cloud-viz`, `via=alloy`.
- OTLP traces receiver (`:4317`/`:4318`) → Tempo (OTLP/HTTP) with a persistent queue (`otelcol.storage.file`).
- Optional metrics scrape → Prometheus remote-write receiver with WAL buffering (`/var/lib/alloy`).
- UI + reload endpoint:
  - UI: `http://<host>:3011/`
  - Reload: `POST http://<host>:3011/-/reload`

### Alertmanager
Config: `alertmanager/config.yml`
- Default receiver is `"null"` (no notifications) until you set a webhook receiver.
- Reload endpoint: `POST /-/reload`

---

## Grafana Alloy — Best-case Use Cases (in this stack)

Alloy is used here as the “single collector” for:
- **Logs:** Docker containers → Loki
- **Traces:** OTLP → Tempo
- **Metrics (optional):** scrape exporters → Prometheus remote-write receiver (push model + WAL)

### Best-case patterns
- **One agent, three signals:** Standardize collection across sites/dev/stage/prod and keep Grafana dashboards consistent.
- **Push-only ingestion:** OTLP (`:4317/:4318`) and Prometheus remote-write (`/api/v1/write`) work without opening Prometheus/Loki/Tempo to the outside world.
- **Offline tolerance:** Loki WAL + OTLP persistent queue + Prometheus remote_write WAL live under `alloy_data` (`/var/lib/alloy`).
- **No-restart config updates:** Alloy supports `POST /-/reload` on the UI port (`3011`) to apply config changes.

### Quick demos
1) **Confirm Alloy UI**
```bash
curl -fsS http://<host>:3011/ | head
curl -fsS http://<host>:3011/metrics | head
```

2) **Generate one trace → Alloy → Tempo**
```bash
docker run --rm --network qio-cloud-viz_edge-net \
  ghcr.io/open-telemetry/opentelemetry-collector-contrib/telemetrygen:latest \
  traces --traces 1 --otlp-endpoint alloy:4318 --otlp-http --otlp-insecure \
  --service qio-foresight-demo
```

3) **Verify Tempo received spans (internal)**
```bash
docker run --rm --network qio-cloud-viz_edge-net curlimages/curl:8.10.1 -fsS \
  http://tempo:3200/metrics | grep -E '^tempo_distributor_spans_received_total'
```

4) **Verify Docker logs are arriving in Loki (internal)**
```bash
docker run --rm --network qio-cloud-viz_edge-net curlimages/curl:8.10.1 -fsS -G \
  --data-urlencode 'query={via="alloy"}' \
  --data-urlencode 'limit=5' \
  http://loki:3100/loki/api/v1/query_range
```

5) **Enable host/container exporters (optional) and see metrics via Alloy push**
```bash
docker compose --profile exporters up -d node_exporter cadvisor
docker run --rm --network qio-cloud-viz_edge-net curlimages/curl:8.10.1 -fsS -G \
  --data-urlencode 'query=up{via="alloy"}' \
  http://prometheus:9090/api/v1/query
```

### Production guidance
- For multi-tenant central backends, prefer a tenant-injecting gateway (don’t trust edge devices to set tenant headers).

## Common Troubleshooting

### Configurator doesn’t load in browser
1. Check health:
   - `curl -fsS http://<host>:3012/config/health`
   - `curl -fsS http://<host>:3010/health`
2. If UI loads but links behave oddly behind TLS/proxy:
   - ensure you’re on the latest templates (path-only links).

### 502 from Nginx after container recreate
`nginx/default.conf` uses Docker DNS resolver (`127.0.0.11`) so Nginx re-resolves upstreams. If you see 502s, confirm `proxy` is using that config and restart `proxy`:
```bash
docker compose restart proxy
```

### Prometheus / Alertmanager changes not taking effect
- Ensure reload endpoints are enabled and reachable:
  - Prometheus: `POST http://prometheus:9090/-/reload`
  - Alertmanager: `POST http://alertmanager:9093/-/reload`
  - Promtail: `POST http://promtail:9080/reload`

### External CDN blocked (Tailwind/HTMX)
The configurator currently uses CDN resources. If your environment blocks outbound internet, vendor these assets locally and serve them from the proxy.

---

## Security Notes (for production hardening)

- Default Grafana admin password is `QiOPassword1#` for local builds—change `GRAFANA_ADMIN_PASSWORD` in your `.env`/secrets and restart the stack before production use.
- CORS is currently global (`*`). If you need cookie-based auth across domains, implement an explicit origin allowlist and `Access-Control-Allow-Credentials: true`.
- Restrict exposed ports if needed:
  - `3012` (proxy/grafana ingress)
  - `3010` (configurator direct)
  - `3011` (Alloy UI + reload)
  - `4317` (OTLP gRPC ingest via Alloy)
  - `4318` (OTLP HTTP ingest via Alloy)
  - `1514` (syslog ingestion)
