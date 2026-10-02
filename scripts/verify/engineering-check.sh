#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
bash scripts/verify/canonical-repository-gate.sh
git diff --check
go test -race ./cmd/... ./internal/...
npm ci --prefix neon-stock-terminal --no-fund
npm run typecheck --prefix neon-stock-terminal
npm test --prefix neon-stock-terminal
npm run build --prefix neon-stock-terminal
npm audit --prefix neon-stock-terminal
# Existing lint debt remains visible; do not silently waive it.
npm run lint --prefix neon-stock-terminal
