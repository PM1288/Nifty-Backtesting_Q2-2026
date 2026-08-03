# ADR-011: Integrate Real NSE and NSDL Connectors into the Existing Institutional-Flow Service

## Status
Accepted

## Context
The main repo already contains a Postgres-backed service at `services/institutional_flow_ingest` with registry, completeness, storage, logging, and scheduler scaffolding. A separate cleaned zip archive was provided at `actual-fii-dii-real-repo.zip`, but that archive is a Node runtime centered on real official-source connector logic for:

- NSE latest FII/FPI + DII cash activity
- NSE participant-wise OI CSV
- NSDL daily trends
- NSDL monthly/yearly history
- NSDL fortnightly sector history
- NSDL monthly trade-wise ZIP aggregation by sector
- NSE Nifty 500 ISIN-to-industry map

The user asked to integrate that package into the main repo and use the existing Postgres instance, while avoiding long-term local storage growth.

## Decision
Port the real source logic from the cleaned archive into the existing Python `institutional_flow_ingest` service and keep Postgres as the canonical operational store.

Do not introduce the extracted Node repo as a second runtime.

Keep raw and curated filesystem artifacts transient by default:
- downloads are checksummed
- registry/audit records are persisted in Postgres
- normalized data is persisted in Postgres
- local raw/curated files are deleted after successful processing unless retention is explicitly enabled

## Consequences
### Positive
- One ingestion service instead of two parallel stacks
- Reuses existing compose wiring, Postgres credentials, logs, reports, and audit tables
- Keeps operator workflow consistent with the rest of the repo
- Saves local disk by not retaining downloaded source files after successful loads

### Negative
- The Python service must absorb more dataset-specific logic
- Some features from the Node archive must be translated rather than reused directly
- Official-source limitations remain real, especially for unstable NSE/BSE public surfaces

## Notes
- The cleaned archive did not include a real direct combined NSE+BSE+MSEI connector. That path should not be fabricated; if it remains unsupported, it must be documented clearly.
