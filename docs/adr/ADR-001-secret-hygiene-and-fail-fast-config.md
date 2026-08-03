# ADR-001: Secret Hygiene and Fail-Fast Config Validation

## Status

Accepted

## Context

The repository contains production-facing services and currently tracks live-looking credentials in configuration files. The Node API also permits insecure runtime behavior through hardcoded or ephemeral fallback secrets for authentication, feedback signing, and internal refresh flows.

That combination makes the repo unsafe to share and allows production startup to proceed with insecure defaults.

## Decision

We will:

- replace tracked live-looking secrets with explicit placeholders
- remove hardcoded and ephemeral security fallbacks from production paths
- require critical secrets to be present at startup in production
- document all required secrets and the manual rotation checklist after merge
- add a lightweight repository secret-scan configuration

Local development remains possible through documented example values and non-production-only behavior.

## Consequences

Positive:

- the repo becomes safer to share and review
- production no longer runs with hidden weak defaults
- operators get a clear inventory of required secrets and rotation work

Trade-offs:

- production and stage environments must provide required secrets before restart
- local setup requires slightly more explicit configuration

## Rollout notes

- merge the config and code changes
- provision required secrets in runtime environments
- rotate any previously exposed values manually
- verify startup and smoke routes in prod/stage after deployment
