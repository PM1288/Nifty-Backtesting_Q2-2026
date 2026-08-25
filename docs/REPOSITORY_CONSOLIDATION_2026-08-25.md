# Canonical repository consolidation

Date: 25 August 2026
Canonical repository: `/home/novius2/trading-stack`
Release branch: `master`
Remote: `https://github.com/PM1288/Nifty-Backtesting_Q2-2026.git`

## Outcome

The deployed integration tree and the Git-backed delivery tree were reconciled into one application repository. Production builds, Compose operations, migrations, regression tools and future development now use only the canonical path above.

The former checkout at `/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026` is retired after the canonical master push. Its committed history is preserved in GitHub and in the verified local bundle:

`/home/novius2/trading-stack/.git-repository-backups/Nifty-Backtesting_Q2-2026-before-consolidation-20260825.bundle`

The bundle is deliberately ignored by Git because it is rollback media, not application source.

## Preservation work

- Compared the registered routes: the canonical application contains 93 routes; the former mirror contained 92. The additional canonical route is Trendlyne Summary. No mirror-only route was dropped.
- Preserved the monthly and rolling all-stock ledgers, including rejected/incomplete rows and rejection reasons.
- Preserved the Paper Trading notifier, automatic popup, sound/native speech controls, permanent NIFTY ticker, stock identity assets, normal cursor, target overlay and high-legibility mode.
- Restored the exchange-calendar-aware NSE daily scheduler, durable notification outbox, delivery worker, additive migration and tests that existed only in the former checkout.
- Preserved useful API regression tests for bounded concurrency, pooled Prisma URLs, mobile notifications and OIIS date handling.
- Preserved the two mirror-only notification/monthly-ledger migrations, audit generators, UI/UX audit scripts, Paper notification workflow tests and all non-binary technical-audit documentation.
- Did not restore the former `firebaseMessaging.ts` and `sendTestNotification.ts`: they are superseded by the canonical `mobileNotificationDispatcher.ts` and would create a second notification implementation.
- Replaced fixed all-stock test counts with population reconciliation so the NIFTY 250 plus F&O universe may change without weakening evidence checks.

## Runtime data consolidation

The former checkout held 82 GB of historical strategy artifacts. They were merged into the ignored canonical runtime-data path:

`/home/novius2/trading-stack/platform/nifty_stratlab/outputs/`

The directory contains 70,776 files after consolidation, including the former root-level strategy outputs. The dashboard now mounts that canonical directory at `/var/lib/nifty-stratlab/h30`; no Compose service depends on another source checkout.

Generated archives and screenshot binaries that are unsuitable for Git were retained under the ignored canonical path `archive/retired-mirror-evidence-20260825/` (527 MB). Former root-level strategy outputs were retained under the ignored canonical strategy-artifact tree. They are data/evidence, not a second repository.

PostgreSQL volumes, credentials and runtime data remain external to Git as required.

## Validation evidence

- Canonical source gate: passed.
- Compose configuration validation: passed.
- Web typecheck: passed.
- Web unit tests: 29/29 passed.
- Preserved extended web tests: 45/45 passed.
- Web production build: passed.
- API typecheck: passed.
- API unit tests: 122/122 passed.
- API production build: passed.
- Go tests: passed.
- NSE ingestor tests: 5/5 passed.
- Canonical dashboard Docker image: built successfully.
- Canonical NSE ingestor Docker image: built successfully.
- Dashboard, scheduler and delivery containers: healthy after recreation.
- Public `/n50/` smoke: HTTP 200.
- Public auth-session bootstrap: HTTP 200.
- Canonical browser feature regression: 8/8 passed after deployment.
- Paper notification regression: 17/17 passed after deployment.

## Known follow-up risks

- The Paper/market workspace contains an expensive market-universe query that reached approximately 72 seconds when several Playwright suites were run concurrently. Critical browser suites must run sequentially until that query is optimised.
- The Node production dependency audit reports 17 existing findings (13 moderate, 3 high and 1 critical). No forced dependency upgrade was applied because it may introduce breaking changes; remediate through a separately tested dependency update.

## Mandatory future workflow

Read `AGENTS.md`, `docs/CANONICAL_REPOSITORY_AND_FEATURE_POLICY.md` and `docs/uiux/FEATURE_PRESERVATION_MANIFEST_2026-08-25.md` before changing shared behavior. Deploy only a pushed `master` commit from the canonical repository. Never create or deploy a second mutable application checkout.

## Rollback

Git source can be recovered from GitHub or the verified bundle. Historical artifacts remain in the canonical ignored runtime path. Container rollback uses the previous image manifest and does not require a database rollback for these source-only changes.
