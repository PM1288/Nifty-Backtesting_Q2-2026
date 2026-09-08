#!/usr/bin/env bash
set -euo pipefail

STACK_DIR="${STACK_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
NODE_ROOT="${STACK_DIR}/neon-stock-terminal"

if [[ ! -f "${NODE_ROOT}/package-lock.json" ]]; then
  echo "Missing locked Node workspace: ${NODE_ROOT}" >&2
  exit 2
fi

cd "${NODE_ROOT}"
npm ci --no-audit --no-fund
npm run prisma:generate --workspace=@app/api
npm run typecheck --workspace=@app/web
npm run typecheck --workspace=@app/api
npm test --workspace=@app/web
npm test --workspace=@app/api

echo "Aligned terminal source verification passed."
