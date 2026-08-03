Title
Fix collector Postgres auth drift and restore collector startup

Objective
Bring the collector back up by correcting the runtime Postgres credential mismatch without reintroducing secrets into tracked repo files.

Repo facts verified
- Root `.env` currently carries placeholder-safe Postgres and SmartAPI values.
- `docker-compose.yml` wires both `postgres` and `collector` from `.env`.
- Live Postgres accepts TCP password auth for `trader` with the current `.env` password.
- The live collector container was not recreated after env sanitization and still carries stale embedded env values.

Files inspected
- [docker-compose.yml](C:/Github_sync/trading-stack/docker-compose.yml)
- [config/config.yaml](C:/Github_sync/trading-stack/config/config.yaml)
- [internal/config/config.go](C:/Github_sync/trading-stack/internal/config/config.go)
- [internal/smartapi/rest_auth.go](C:/Github_sync/trading-stack/internal/smartapi/rest_auth.go)

Plan
- Confirm the network-valid Postgres password.
- Confirm collector runtime env drift.
- Rebuild and force-recreate only the collector with the current DB password and preserved runtime SmartAPI credentials.
- Verify health and collector logs.

Changes made
- Added this worklog.
- Updated the collector service to load an additional untracked `.env.collector.runtime` overlay after the shared `.env` file so live collector credentials can be supplied without reintroducing secrets into tracked repo files.
- Removed collector-specific compose overrides that were forcing placeholder `POSTGRES_PASSWORD`, `SMARTAPI_PASSWORD`, and `SMARTAPI_TOTP_SECRET` values back into the container.
- Updated SmartAPI login password selection so an explicit MPIN always wins over the legacy password field.
- Added a narrow unit test covering MPIN-over-password precedence.

Validation run
- Verified Postgres TCP auth with `CHANGE_ME_POSTGRES_PASSWORD`.
- Verified the stale collector container had `POSTGRES_PASSWORD=trader_2026`.
- Rebuilt and recreated the collector.
- Confirmed the Postgres auth failure is gone and the collector now reaches SmartAPI login.
- Added ignored `.env.collector.runtime` and confirmed the collector now loads runtime API key/client code from the overlay.
- Corrected the collector runtime client code and confirmed SmartAPI now rejects only the TOTP/client session step instead of the earlier client-code mismatch.
- Confirmed the running collector was still receiving placeholder `SMARTAPI_PASSWORD` / `SMARTAPI_TOTP_SECRET` values from compose-level overrides.
- Patched the collector image and compose file, rebuilt the collector, and verified with `go test ./internal/smartapi ./internal/config`.
- After the fixes, the collector now consistently fails only with `Invalid totp and client combination`.
- Switched the local runtime overlay from one-time `SMARTAPI_TOTP_CODE` input to a durable TOTP seed and recreated the collector.
- Verified steady-state collector health on `http://localhost:18081/healthz`.
- Verified the collector now stays up healthy, reports `ws_connected: true`, and shows `last_tick_ago_seconds` near zero during market hours.

Screens reviewed
- Not applicable.

Decisions made
- Do not change the database password because the rest of the stack is aligned to the current `.env` value.
- Do not write live SmartAPI secrets into tracked repo files.
- Use a collector-specific ignored env overlay for live runtime credentials.
- Treat SmartAPI TOTP as a short-lived operator input unless a valid seed from the QR/TOTP setup URI is supplied.

Risks / follow-ups
- The collector still requires valid live SmartAPI credentials in `.env.collector.runtime` to authenticate successfully.
- The Postgres issue is resolved.
- The `API key / client code` pairing is now accepted enough to progress past the earlier mismatch.
- The former SmartAPI blocker is resolved by using the durable TOTP seed instead of a one-time code.
- SmartAPI forum guidance indicates TOTP is based on a 30-second code window and the durable seed comes from the QR/TOTP setup URI, not from the app secret key.

Resume here next time
- Keep the collector on the durable TOTP seed path in the ignored runtime overlay and monitor trading-day websocket stability.
