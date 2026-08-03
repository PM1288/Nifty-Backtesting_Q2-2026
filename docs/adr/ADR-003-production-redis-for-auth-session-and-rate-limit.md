# ADR-003: Production Redis for Auth Session and Rate Limiting

## Status

Accepted

## Context

The dashboard API already relies on Redis for some cache use cases, but auth/session behavior and production-sensitive rate limiting remain partially ambiguous:

- session storage can still degrade into process-local memory when Redis is unavailable in some non-required modes
- rate limiting for login and feedback is process-local only
- health output only reports Redis configuration, not whether the dependency is actually ready or fail-closed

This is not acceptable for a production-facing auth surface shared by prod and stage behind nginx.

## Decision

The API will treat Redis as the canonical shared store for:

- auth/session storage whenever auth is required in production
- production-sensitive rate limiting for login, signup, feedback submission, and internal refresh routes

The API will:

- fail closed for session and protected rate-limit behavior when Redis is required but unavailable
- allow an in-memory fallback only in development and only when an explicit development-only flag enables it
- expose Redis dependency readiness and degraded state through health/readiness output and structured logs

Cookie path isolation remains unchanged and continues to be controlled per deployment through environment variables.

## Consequences

Benefits:

- removes silent single-process auth/session behavior in production
- makes rate limiting consistent across replicas/processes
- gives operators explicit visibility into Redis dependency state

Costs:

- local development needs an explicit opt-in if Redis is not available
- the API must own additional store lifecycle and readiness logic
- tests must cover production versus development selection and fail-closed behavior

## Rollout notes

- production and stage must provide working Redis URLs before enabling auth/session
- operators should monitor health/readiness output and Redis connection logs after rollout
- nginx rate limiting remains useful as edge protection, but the API becomes the authoritative shared-store enforcement layer for sensitive flows
