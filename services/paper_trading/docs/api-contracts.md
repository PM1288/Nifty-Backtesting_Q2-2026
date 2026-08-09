# API contracts

OpenAPI is generated at `openapi.json`; JSON Schema Draft 2020-12 files are under `schemas/inbound`. All protected endpoints require `Authorization: Bearer`, writes require `Idempotency-Key`, and financial JSON values are decimal strings. Reusing a key with a changed request returns 409. All responses carry `X-Trading-Environment: PAPER`.

The stable paths are listed in the service README and can also be inspected at `/openapi.json` while the API runs.
