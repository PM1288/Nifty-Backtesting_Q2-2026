# ADR-002: Canonical Nginx Ingress and Edge Hardening

## Status

Accepted

## Context

The repository currently contains two nginx configurations:

- `compose/nginx/nginx.conf`, which is the file actually mounted by `docker-compose.yml`
- `compose/n50-nginx/nginx.conf`, which contains an older hardening pass but is not used by the current stack

That split makes ingress behavior ambiguous and increases the risk of security drift. The Node API also leaves CSP disabled in Helmet, which means the effective browser policy should be enforced at the reverse proxy layer.

## Decision

We will:

- treat `compose/nginx/nginx.conf` as the canonical nginx source of truth
- mark `compose/n50-nginx/nginx.conf` as historical/deprecated
- centralize security headers, request limits, proxy timeouts, and body-size controls in nginx
- keep same-origin routing stable for prod and stage base paths plus the existing proxied service surface
- document which controls belong in nginx and which belong at CDN/WAF

## Consequences

Positive:

- ingress behavior is explicit and reviewable in one place
- edge protections apply consistently to prod, stage, and localhost gateway flows
- CSP enforcement is no longer implicit or split between app and proxy layers

Trade-offs:

- nginx configuration becomes more opinionated and must be kept aligned with analytics and auth integrations
- proxy-layer CSP issues can surface immediately if new third-party origins are introduced without documentation

## Rollout notes

- deploy the updated nginx config through the existing `nginx` service
- validate headers and rate limits through `localhost:19090` before pushing public traffic changes
- if a new third-party browser dependency is introduced later, update nginx CSP and the ingress ownership docs in the same change
