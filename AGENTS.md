# Canonical NIFTY 50 Trader repository rules

This directory is the only canonical application source and the only directory from which production may be built or deployed.

## Non-negotiable workflow

1. Work only in `/home/novius2/trading-stack`.
2. Start every task from a named Git branch based on the current canonical branch. Never implement application code in a second checkout or copied repository.
3. Preserve existing features. Before changing a shared shell, route, API contract, strategy page, Paper Trading page, table, chart or authentication component, read `docs/CANONICAL_REPOSITORY_AND_FEATURE_POLICY.md` and `docs/uiux/FEATURE_PRESERVATION_MANIFEST_2026-08-25.md`.
4. Make additive, scoped changes. Do not replace a shared file with a copy from an archive, ZIP, handover directory or another checkout.
5. Run the affected unit tests plus the mandatory preservation gate before deployment.
6. Commit and push every deployed change. Production must correspond to a pushed commit; do not deploy an uncommitted worktree.
7. Never commit `.env`, credentials, database DSNs, API tokens, webhook secrets, runtime exports, market-data archives, caches, screenshots or generated environments.
8. PostgreSQL and mounted runtime volumes are authoritative data. Source consolidation must never delete or rewrite them.
9. Paper/live permissions, confirmations, idempotency and server-side validation remain authoritative.
10. Record material operational work in `AGENT_HANDOFF.md` and update the feature manifest when a shared capability is added.

## Required checks before a dashboard deployment

```bash
cd /home/novius2/trading-stack/neon-stock-terminal/apps/web
npm run typecheck
npm test
npm run build

cd /home/novius2/trading-stack/neon-stock-terminal/apps/api
npm run typecheck
npm test
npm run build

cd /home/novius2/trading-stack
bash scripts/verify/canonical-repository-gate.sh
```

Authenticated Playwright checks use credentials from the protected deployment environment. Never write passwords into scripts or documentation.
