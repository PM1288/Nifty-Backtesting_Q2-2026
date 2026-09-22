# Scalper V3 retirement — 22 September 2026

## Outcome

The alternate Scalper V3 evaluation workspace is retired. Scalper V2 remains
the only selectable Scalper workstation in Trading Analytics.

Historical bookmarks are handled safely:

- `view=scalper_v3` is replaced with `view=scalper_v2`;
- `popout=scalper_v3` is replaced with `popout=scalper_v2`;
- all other symbol, expiry, strike, interval and session query parameters are
  preserved by the URL canonicalization.

No market-data query, collector, strategy rule, signal, drawing, measurement,
export, authentication or order-permission contract changed. Historical V3
documents remain in the repository solely as an implementation audit record.

## Validation

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
node tools/playwright/scalper-v3-retirement.mjs
```

The browser check authenticates using the protected deployment environment,
opens both legacy V3 URL shapes, proves they canonicalize to V2, verifies the
V3 navigation item is absent, confirms V2 remains visible and records browser
errors plus a screenshot under
`/home/novius2/NIFTY50/evidence/scalper-v3-retirement-20260922/`.

## Release evidence

- Web: typecheck, production build and 271/271 tests passed.
- API: typecheck, production build and 264/264 tests passed.
- Canonical repository gate and diff check passed.
- Authenticated production Chromium passed 6/6 checks with no page errors.
- Both legacy normal and pop-out V3 links canonicalized to V2.
- Only `n50-dashboard` was recreated. It is healthy with zero restarts on image
  `sha256:92113aa4714728b588f32a1dbc140fc7200e02093d3061198ce1a1688bcde9d2`.
- The deployment script's immediate first route probe encountered a transient
  502 while the gateway reconnected. The subsequent route returned HTTP 200
  and the authenticated browser checks passed.
- Rollback image:
  `trading-stack-n50-dashboard:before-scalper-v3-retirement-20260922`.
