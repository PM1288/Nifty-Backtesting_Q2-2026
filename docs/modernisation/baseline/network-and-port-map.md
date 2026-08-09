# Network and port map

Captured: 2026-08-09 UTC

## Trading network

- Internal bridge: `trading-stack-novius2_default`.
- Container Nginx publishes `0.0.0.0:19090` and is the tested N50 application
  gateway.
- PostgreSQL publishes `0.0.0.0:5432`. This is an existing operational state,
  not a modernisation recommendation.
- UFW currently permits `5432/tcp` from `Anywhere` for both IPv4 and IPv6.
  PostgreSQL listens on `*` and the final HBA rule is host/all/all/all with
  `scram-sha-256`. Password authentication is therefore present, but network
  exposure is broader than the target safety policy. This was audited only;
  no firewall, listener, HBA or Compose rule was changed during capture.
- Paper API publishes only `127.0.0.1:18088`.
- Other application APIs are internal-only in the inspected running stack.
- Cloudflare tunnel containers exist on the host; exact ownership and routes
  require Phase 1 tracing.

## Tested routes

- `http://127.0.0.1:19090/n50/health` — HTTP success, ready.
- `http://127.0.0.1:19090/health` — HTTP 404 baseline behaviour.
- `http://127.0.0.1:18088/health/live` — live, PAPER.
- `http://127.0.0.1:18088/health/ready` — ready, PAPER.

No internal port was newly published and no firewall rule was changed.

## Required hardening decision

Before a production cutover, resolve the legitimate remote-client list and
replace the global firewall exposure with the smallest validated Tailscale or
exact-IP scope. Database authentication and firewall reachability are separate
controls; retaining SCRAM does not by itself make a publicly reachable listener
the preferred deployment. The change must be preceded by a tested pgAdmin and
application connectivity check and must retain an explicit rollback rule.
