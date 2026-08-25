#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

test "$(git rev-parse --show-toplevel)" = "$repo_root"
test -n "$(git remote get-url origin)"
test -f AGENTS.md
test -f docs/CANONICAL_REPOSITORY_AND_FEATURE_POLICY.md
test -f docs/uiux/FEATURE_PRESERVATION_MANIFEST_2026-08-25.md

for required in \
  neon-stock-terminal/apps/web/src/components/chrome/PaperTradeNotifier.tsx \
  neon-stock-terminal/apps/web/src/lib/fontMode.ts \
  neon-stock-terminal/apps/web/src/pages/MonthlyStrategiesPage.tsx \
  neon-stock-terminal/apps/web/src/pages/TrendlyneSummaryPage.tsx \
  neon-stock-terminal/apps/api/src/routes/trendlyneSummary.ts \
  neon-stock-terminal/apps/api/src/routes/rollingMonthly.ts \
  neon-stock-terminal/apps/api/src/routes/rollingWindow.ts \
  services/nse_ingestor/app/scheduler.py \
  services/nse_ingestor/app/notifications.py \
  services/nse_ingestor/sql/004_daily_scheduler_notifications.sql; do
  test -f "$required" || { echo "Missing required feature source: $required" >&2; exit 1; }
done

if rg -n 'cursor:\s*none\s*!important' neon-stock-terminal/apps/web/src/components/visual/MarketTargetCursor.module.css; then
  echo "Native cursor regression detected" >&2
  exit 1
fi

rg -q 'High-legibility font' neon-stock-terminal/apps/web/src/components/chrome/AuthStatus.tsx
rg -q 'PaperTradeNotifier' neon-stock-terminal/apps/web/src/components/chrome/AppShell.tsx
rg -q 'Not selected' neon-stock-terminal/apps/web/src/pages/MonthlyStrategiesPage.tsx
rg -q 'Latest not selected' neon-stock-terminal/apps/web/src/pages/MonthlyStrategiesPage.tsx
rg -q '/strategy/trendlyne-summary' neon-stock-terminal/apps/web/src/App.tsx
rg -q 'https://n50.nifty50today.co.in' compose/compose.core.yml

if rg -n '/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026' \
  docker-compose.yml compose scripts services neon-stock-terminal/apps \
  --glob '!**/docs/**' \
  --glob '!scripts/verify/canonical-repository-gate.sh'; then
  echo "Retired repository dependency detected" >&2
  exit 1
fi

if git ls-files | rg '(^|/)(\.env$|secrets/|node_modules/|__pycache__/|\.venv/)'; then
  echo "Secret, environment, dependency or cache path is tracked" >&2
  exit 1
fi

echo "Canonical repository source gate passed."
