# ADR-006: Camera Deny-By-Default And Review Guardrail

Date: 2026-03-31

## Status

Accepted

## Context

The N50 product is a market-analysis platform. Its public scope is analytics, stock reports, backtesting, options, feedback, and trust/freshness review. It does not have a user-facing camera workflow, webcam overlay, or image-capture feature.

The ingress layer already enforces a deny-by-default browser policy with `Permissions-Policy: camera=()`. That policy matches the current product scope and avoids accidental permission prompts on public routes.

The risk is not current misuse. The risk is drift: camera APIs could be introduced later as an incidental experiment without a privacy review, product decision, or updated documentation.

## Decision

We will keep camera disabled by default at the browser-policy layer and add a repository guardrail that fails if camera APIs are introduced casually.

Current guardrails:

- nginx remains the effective camera policy enforcement layer with `Permissions-Policy: camera=()`
- repository script `neon-stock-terminal/scripts/check-no-camera.mjs` scans the current app/service code roots for common camera/webcam API usage
- root script `guard:camera` runs that check as an explicit validation step

Future camera functionality is not prohibited forever, but it is blocked until all of the following are true:

1. a product requirement exists
2. a privacy review is completed
3. a new ADR documents scope, routes, UX, data handling, and retention posture
4. the allowlist/guardrail is updated intentionally
5. ingress policy is updated intentionally rather than by omission

## Consequences

Positive:

- no public route should trigger camera permission prompts
- current product/docs stay aligned with actual scope
- future camera work now requires an explicit engineering and privacy decision

Trade-offs:

- experimental camera prototypes cannot be merged casually
- any future camera feature must touch both policy and guardrail layers, which adds friction by design
