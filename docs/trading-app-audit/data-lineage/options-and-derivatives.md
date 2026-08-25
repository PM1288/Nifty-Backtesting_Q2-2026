# Options and derivatives lineage

Options Structure/Snapshot → analytical option routes → canonical option-chain
snapshots and SmartAPI/NSE chain sources → structure, strike, expiry, OI,
spread and freshness view models → ECharts/tables.

Long Options and NIFTY weekly options are independent strategy services and
routes. Their entry prices use executable-side quote evidence where enforced;
stale or one-sided chains fail closed in tested gateway logic.

The Futures workspace currently cannot complete this lineage at runtime:
`GET /v1/workspace/futures` returned HTTP 500 in all four viewport captures.
