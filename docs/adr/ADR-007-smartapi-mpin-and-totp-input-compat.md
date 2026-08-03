# ADR-007: SmartAPI MPIN and TOTP Input Compatibility

## Status
Accepted

## Date
2026-04-01

## Context

The root Go collector authenticates to Angel One SmartAPI before opening the SmartAPI websocket.

The current collector implementation already uses the documented `loginByPassword` route, but the operator-facing semantics have shifted:

- SmartAPI account login now expects the user's account MPIN in the request field historically named `password`.
- Operators may provide either:
  - a base32 TOTP seed, or
  - a live 6-digit TOTP code from the authenticator app.

The existing collector only modeled `password + totp_secret`, and always attempted to base32-decode the TOTP input.

That created two operational risks:

1. Current SmartAPI guidance is easy to misread because the API route name did not change even though the credential semantics did.
2. A valid live 6-digit TOTP code supplied through the existing secret path would fail because the collector treated it as a seed.

## Decision

Keep the SmartAPI login endpoint unchanged, but make the collector inputs explicit and backward-compatible:

- Keep `smartapi.password` and `SMARTAPI_PASSWORD` working.
- Add `smartapi.mpin` and `SMARTAPI_MPIN` as explicit aliases for the same login field.
- Keep `smartapi.totp_secret` and `SMARTAPI_TOTP_SECRET` working for base32 seeds.
- Allow `smartapi.totp_secret` / `SMARTAPI_TOTP_SECRET` to pass through unchanged when the provided value is already a 6-digit TOTP code.
- Add `smartapi.totp_code` and `SMARTAPI_TOTP_CODE` as the preferred explicit runtime input for a live 6-digit TOTP code.

Precedence:

1. `totp_code`
2. `totp_secret` interpreted as a direct 6-digit code when it matches that shape
3. `totp_secret` interpreted as a base32 seed

## Consequences

Positive:

- Current SmartAPI login expectations are supported without breaking older deployments.
- Operators can choose whether to store a seed or inject a short-lived code at runtime.
- The collector remains compatible with the current websocket/token flow.

Trade-offs:

- The repo continues to carry a legacy field name (`password`) for backward compatibility.
- A true long-term cleanup may still rename the config surface more aggressively, but that would be a broader operator contract change.

## Operational notes

- Supplying `api_key`, `client_code`, and a TOTP value is not enough by itself; the collector still requires either:
  - `access_token + feed_token`, or
  - MPIN/password-equivalent login input.
- Any SmartAPI credentials shared in chat or logs should be rotated.
