# Runtime Storage Migration (Phase 4)

Phase 4 changes the prod-like runtime from repo-path bind mounts to named volumes.

## Path migrations

| Old repo path | New runtime location |
|---|---|
| `services/nse_ingestor/runtime/inbound` | volume `nse_ingestor_inbound` mounted at `/data/inbound` |
| `services/nse_ingestor/runtime/staging` | volume `nse_ingestor_staging` mounted at `/data/staging` |
| `services/nse_ingestor/runtime/logs` | removed from prod-like runtime; use `docker logs nse_ingestor` |
| `services/nse_orchestration_exports/runtime/exports` | volume `nse_orchestration_exports` mounted at `/var/lib/nse/exports` |
| `services/nse_intraday_intelligence/runtime/exports` | volume `nse_intraday_exports` mounted at `/var/lib/nse/intraday_exports` |
| `services/nse_reco_state_engine/runtime/exports` | volume `nse_reco_exports` mounted at `/app/exports` |
| `services/institutional_flow_ingest/raw` | volume `institutional_flow_raw` mounted at `/app/raw` |
| `services/institutional_flow_ingest/staging` | volume `institutional_flow_staging` mounted at `/app/staging` |
| `services/institutional_flow_ingest/curated` | volume `institutional_flow_curated` mounted at `/app/curated` |
| `services/institutional_flow_ingest/logs` | volume `institutional_flow_logs` mounted at `/app/logs` |
| `services/institutional_flow_ingest/run_reports` | volume `institutional_flow_run_reports` mounted at `/app/run_reports` |

## Data copy guidance

If a host path contains data that must be preserved before moving to the named-volume runtime:

1. Start the target overlay once so Docker creates the new named volume.
2. Copy the host-path contents into the volume with a temporary helper container.
3. Recreate the service and verify the expected files are present inside the container.

Example pattern:

```bash
docker run --rm \
  -v nse_orchestration_exports:/target \
  -v ${PWD}/services/nse_orchestration_exports/runtime/exports:/source:ro \
  alpine sh -c "cp -a /source/. /target/"
```

## Dev overlay note

`compose.dev.yml` remains the operator-friendly local path. It preserves extra host port exposure for direct debugging, but core runtime state no longer relies on repo bind mounts by default.
