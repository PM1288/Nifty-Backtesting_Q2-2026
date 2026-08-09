# Nginx current state

Captured: 2026-08-09 UTC

Two Nginx operating contexts exist:

1. Host Nginx 1.24.0 is active and enabled. `nginx -t` passed. Its inspected
   configuration proxies generic listeners on ports 60 and 80 to other local
   services. There were no symlinks under `/etc/nginx/sites-enabled`.
2. `trading-stack-novius2-nginx-1` runs image
   `trading-stack-nginx-core:latest`, publishes port 19090 and is the tested N50
   gateway.

The host service may be shared by unrelated applications and must not be moved,
restarted or replaced during trading-stack work without a separate ownership
proof. The container Nginx remains the safest current N50 cutover boundary.

Baseline route behaviour:

- N50 nested health works at `/n50/health`.
- gateway-root `/health` returns 404.
- the deployed frontend's nested `/n50/strategy/oiis-live` route works through
  this gateway.

Phase 1 must inventory the repository Nginx locations, cache/security headers,
WebSocket upgrade routes and Cloudflare origin path before proposing changes.
