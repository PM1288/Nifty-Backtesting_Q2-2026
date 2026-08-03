# Playwright Smoke Harness

This folder contains a minimal browser-based smoke harness for the current `/n50/` app shell.

It captures screenshots and lightweight metadata for:

- `/`
- `/feedback`
- `/analytics/stock/RELIANCE`

Default output path:

- `output/playwright/secret-hygiene-config-hardening/`

## Install

```powershell
cd tools/playwright
npm install
npx playwright install chromium
```

## Run against the local gateway

```powershell
cd C:\Github_sync\trading-stack
$env:PLAYWRIGHT_BASE_URL="http://localhost:19090/n50"
node tools/playwright/smoke.mjs
```

## Optional overrides

- `PLAYWRIGHT_BASE_URL`
  Default: `http://localhost:19090/n50`
- `PLAYWRIGHT_OUTPUT_DIR`
  Default: `output/playwright/secret-hygiene-config-hardening`
- `PLAYWRIGHT_TASK_SLUG`
  Default: `secret-hygiene-config-hardening`
- `PLAYWRIGHT_ROUTES_JSON`
  JSON array of `{ "slug": "...", "path": "..." }` objects.
  Example:
  `[{"slug":"landing","path":"/"},{"slug":"options","path":"/options"},{"slug":"backtesting","path":"/backtesting"}]`

The script is intentionally small and review-focused. It is not a regression test suite.
