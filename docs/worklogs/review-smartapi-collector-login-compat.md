Title: SmartAPI collector auth review and compatibility update

Objective
Review the root Go collector against current SmartAPI authentication/websocket behavior and make the collector accept current documented login inputs without breaking existing seed-based deployments.

Repo facts verified
- The collector logs in through `/rest/auth/angelbroking/user/v1/loginByPassword` in `internal/smartapi/rest_auth.go`.
- The websocket still uses auth token + api key + client code + feed token headers in `internal/smartapi/ws.go`.
- The repo currently modeled SmartAPI auth as `api_key + client_code + password + totp_secret`.
- The bundled SmartAPI SDK source in `docs/source/smartConnect.py` still targets `loginByPassword`, but current operator guidance treats the `password` field as MPIN and the TOTP input as either a generated or live code.
- `docker-compose.yml` already supports `COLLECTOR_PORT` through `${COLLECTOR_PORT:-8080}:8080`.
- The user-supplied details did not include an MPIN/password-equivalent credential, so live login remains incomplete until that value is provided.

Files inspected
- internal/smartapi/rest_auth.go
- internal/smartapi/ws.go
- internal/config/config.go
- cmd/collector/main.go
- docker-compose.yml
- README.md
- docs/security/secrets-and-config.md
- config.example.yaml
- config/config.yaml
- config/config-use-this.txt
- docs/source/smartConnect.py
- docs/source/smartWebSocketV2.py

Plan
- Add explicit SmartAPI MPIN and TOTP code config/env aliases while keeping existing password/seed support.
- Make login accept either a TOTP seed or a ready 6-digit TOTP code.
- Update docs, ADR, and operator notes so collector auth precedence is explicit.
- Run focused Go tests for SmartAPI auth helper behavior.

Changes made
- Added `smartapi.mpin` and `SMARTAPI_MPIN` as explicit aliases for the existing SmartAPI login password field in `internal/config/config.go`.
- Added `smartapi.totp_code` and `SMARTAPI_TOTP_CODE` for explicit live 6-digit TOTP input in `internal/config/config.go`.
- Kept backward compatibility by continuing to support `smartapi.password` / `SMARTAPI_PASSWORD` and `smartapi.totp_secret` / `SMARTAPI_TOTP_SECRET`.
- Updated SmartAPI login logic in `internal/smartapi/rest_auth.go` so TOTP resolution now follows this order:
  1. `totp_code`
  2. `totp_secret` when it already looks like a 6-digit code
  3. `totp_secret` interpreted as a base32 seed and converted into a code
- Added focused tests in `internal/smartapi/rest_auth_test.go` for explicit code, legacy six-digit input, seed-derived code, and invalid code handling.
- Updated `README.md`, `docs/security/secrets-and-config.md`, `config.example.yaml`, `config/config.yaml`, and `config/config-use-this.txt` to document MPIN semantics and TOTP input options.
- Added ADR `docs/adr/ADR-007-smartapi-mpin-and-totp-input-compat.md`.

Validation run
- `gofmt -w internal\\config\\config.go internal\\smartapi\\rest_auth.go internal\\smartapi\\rest_auth_test.go`: passed.
- `go test ./internal/smartapi ./cmd/collector` with repo-local cache: blocked by network restrictions while downloading Go modules from `proxy.golang.org`.
- `go test ./...` with repo-local cache: blocked by the same restricted outbound module download failure.
- Manual repo review verified that the collector websocket path does not need a protocol change for the current SmartAPI V2 header model.

Screens reviewed
- Not applicable for this backend/auth review.

Decisions made
- Preserve `loginByPassword` endpoint compatibility because both the bundled SDK source and current SmartAPI guidance still point there.
- Treat MPIN as the effective semantic for the existing password field, with a new explicit alias instead of a breaking rename.
- Support both TOTP seed storage and short-lived code injection because operators use both patterns.

Risks / follow-ups
- Live collector login still cannot be completed from the provided details alone because MPIN was not provided.
- User-provided SmartAPI credentials should be rotated because they were shared in chat.
- Once outbound Go module access is available, rerun focused `go test` for `internal/smartapi` and `cmd/collector`.

Resume here next time
- Supply `SMARTAPI_MPIN` (or `SMARTAPI_PASSWORD`) and run a live collector login smoke test against the actual SmartAPI account.
