# Documentation audit tooling

This folder contains read-only Playwright capture tooling for
`docs/trading-app-audit`. It uses the existing authorised development login,
performs GET/navigation interactions only, captures responsive evidence, and
records failures without hiding or downgrading them.

Run the source inventory first:

```bash
node scripts/audit/generate_trading_app_audit.mjs
```

Then run the browser audit:

```bash
PLAYWRIGHT_ORIGIN=http://127.0.0.1:19090 \
PLAYWRIGHT_ADMIN_PASSWORD_FILE=/home/novius2/trading-stack/.env \
node tests/documentation-audit/capture-all-pages.mjs
```

The password file is read in-process; its value is never written to evidence.
