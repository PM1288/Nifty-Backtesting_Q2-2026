# Migration and rollback

## Rules

1. Preserve `/v1` and legacy routes until authenticated old/new parity passes.
2. Use additive migrations only after a fresh backup and restore proof.
3. Keep the new workbench and progressive APIs behind repository-appropriate feature flags.
4. Apply source-mirror changes to `/home/novius2/trading-stack` explicitly; never assume the runtime tree follows Git.
5. Rebuild/recreate only the service changed by a slice.
6. Never remove Compose orphans during a targeted deployment.

## Futures P0 rollback

The 23 August repair changes only `apps/api/src/routes/workspace.ts`: the SQL window rank is cast to `int` and the response adapter defensively converts it to a JSON number. Rollback is the prior dashboard image `sha256:63318a321f1a9005d1d64f6f443620bbc43fa238398927e05c54ef9455463853`; no database rollback is required.

## Cutover gate

Do not retire old components/contracts until field, calculation, permissions, deep-link, export and performance parity are signed off. A visually rendered route is not acceptance.
