# Error handling

> Evidence basis: static source inspection generated 2026-08-23T11:30:04.012Z. Runtime behaviour is labelled separately. “UNVERIFIED” means the source alone cannot establish the runtime condition.

The shared API client throws `API <status>: <body>`, emits an authentication-required browser event on 401/403, and records analytics errors/slow requests. Pages vary in whether they show an error surface, retain previous React Query data, or render an empty state.

Runtime evidence records console errors and failed `/v1`/auth requests per route. A caught error that renders zero or an empty chart without an explicit unavailable state is a data-trust defect and must be classified in known gaps.
