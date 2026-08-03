# ADR-001 Strategy Versioning

## Status

Accepted

## Decision

Strategy definitions are stored as immutable version rows. Once a published run exists against a version, that version is not edited in place.

## Why

- preserves historical reproducibility
- avoids silent result drift
- keeps compare pages explainable
- supports staged rollout from draft to active to archived

## Consequence

Editing an active strategy must create a new version and trigger new precompute, not mutate old published history.
