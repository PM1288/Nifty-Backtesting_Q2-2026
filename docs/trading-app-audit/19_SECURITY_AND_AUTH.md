# Security and authentication

> Evidence basis: static source inspection generated 2026-08-23T11:30:04.012Z. Runtime behaviour is labelled separately. “UNVERIFIED” means the source alone cannot establish the runtime condition.

The gateway uses session authentication, CSRF endpoints for state-changing web calls, rate limiting on login/feedback, Helmet, CORS configuration, and a global guard for `/v1`. Admin/control-plane checks must be verified both in UI and backend handlers; client-only hiding is not authorization.

No secret values are reproduced here. Repository scans must distinguish example variable names from committed credentials. Runtime audit uses an existing authorised development-login path and never bypasses the auth guard.
