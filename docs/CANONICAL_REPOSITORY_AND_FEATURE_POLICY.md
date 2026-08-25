# Canonical repository and feature-preservation policy

Date: 25 August 2026
Canonical source: `/home/novius2/trading-stack`
Git remote: `https://github.com/PM1288/Nifty-Backtesting_Q2-2026.git`

## Decision

There is one application repository. Production images, migrations, services, documentation and test tooling are built only from the canonical source above. ZIP files and retired checkouts are input evidence, not alternate application sources.

The former mirror `/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026` is retired. It must not be recreated, edited or deployed. Its committed history is preserved in GitHub and in the pre-consolidation Git bundle recorded by the consolidation report.

## Why this rule exists

Two mutable trees previously contained different versions of `AppShell`, authentication configuration, strategy ledgers, cursor behavior, typography, Paper Trading alerts and regression scripts. Deploying from whichever tree had most recently been edited caused previously accepted features to disappear. A source copy is not a merge strategy.

## Change protocol

1. Fetch and branch in the canonical repository.
2. Record the intended routes, API endpoints, components and feature-manifest rows.
3. Inspect the current implementation before editing.
4. Apply a narrow patch; never copy an entire shared page from an old delivery.
5. Run focused tests.
6. Run the canonical repository gate and authenticated preservation regressions.
7. Build the production image from the commit being tested.
8. Deploy only that image and record its Git SHA.
9. Verify public login, authenticated workspace APIs, desktop and mobile navigation.
10. Commit, push and update `AGENT_HANDOFF.md`.

`master` is the only release and deployment branch. Short-lived feature branches are allowed only inside this repository and must be merged to `master`; a feature branch must never become a second mutable deployment source.

## Mandatory preserved capabilities

- Exact-origin authenticated login and Secure session restoration.
- Permanent NIFTY 50 level/change ticker attached to the header.
- Strategy destinations: OIIS, Monthly, Rolling 5/30/60, Trendlyne Summary, Long Options and NIFTY Options.
- Monthly and Rolling all-stock ledgers, including selected, rejected, incomplete and continuation states with reason inspectors.
- Paper Trading Evidence Workbench, canonical calculations, all table fields, market-book evidence, filters and inspectors.
- Bottom-right Paper alert history, automatic entry/target popup, sound and native browser speech controls.
- Stock symbols, company names, profile filters and logos on Home, Stock, Strategy and Paper Trading surfaces.
- Normal browser cursor plus the non-blocking target-cursor overlay.
- Inter numeric typography and persistent Atkinson high-legibility mode.
- Responsive navigation, mobile sheets, contained table scrolling and accessible focus behavior.
- Trendlyne ingestion and dashboard, options intelligence, NIFTY weekly options and data-quality routes.

## Standalone definition

The source repository is standalone when a clean clone plus protected environment configuration can:

1. install locked dependencies;
2. build Go, Node/TypeScript and Python-owned containers without files from another checkout;
3. apply additive migrations;
4. start the documented Compose profiles;
5. serve `/n50/`, authentication and all registered routes;
6. connect to existing PostgreSQL/runtime volumes without embedding their data in Git;
7. pass the preservation gate and public authenticated browser regressions.

Runtime data, credentials and database volumes are intentionally external. Standalone does not mean committing production data or secrets.

Historical strategy artifacts live under the ignored canonical path `platform/nifty_stratlab/outputs/` and are mounted from there. No service may bind-mount data from another source checkout.

## Prohibited practices

- A second writable application checkout.
- Deployment from a dirty or unpushed tree.
- Whole-file replacement from a ZIP or handover package.
- Hard-coded live record counts in durable regression tests.
- Weakening authentication to make test harnesses pass.
- Treating missing data as zero.
- Deleting an existing route or field without explicit product approval and redirect/migration evidence.

## Required acceptance evidence

- Git SHA and clean-tree result.
- Web/API typecheck, unit tests and production builds.
- Route-map comparison.
- Login HTTP 200 using the canonical browser Origin.
- Monthly/rolling evaluation counts and rejected-reason evidence.
- Paper notifier regression.
- Paper Workbench reconciliation regression.
- Native cursor and high-legibility persistence regression.
- Home stock-logo/pixel-card regression.
- Container health and public smoke checks.

## Rollback

Keep the previously running image tag until the new commit passes production checks. Roll back by recreating only the affected container from that image; database rollback is not required for frontend-only changes. Additive migrations require their documented, migration-specific rollback procedure.
