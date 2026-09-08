# Aligned terminal replication and deployment

Date: 8 September 2026

## Authoritative identity

- GitHub: `https://github.com/PM1288/Nifty-Backtesting_Q2-2026.git`
- Release branch: `master`
- Canonical host checkout: `/home/novius2/trading-stack`
- Feature commit: `b7f0e9f0bbd46c45c9a083329c2de36d3c42fc66`
- Production Compose project: `trading-stack-novius2`
- Service: `n50-dashboard`
- Public route: `https://n50.nifty50today.co.in/n50/strategy/trading-analytics?view=scalper&interval=5`

The external screenshot package is acceptance evidence, not a second source tree:

```text
/home/novius2/NIFTY50/UI/ALIGNED_TERMINAL_ACCEPTANCE_PACKAGE_20260908
/home/novius2/NIFTY50/UI/ALIGNED_TERMINAL_ACCEPTANCE_PACKAGE_20260908.zip
```

ZIP SHA-256:

```text
ce7087ab83705d9fdbb6496fbf8c4956841c17c37e44a5eff9be487f6ce40f6a
```

## Protected prerequisites

A clean clone contains application source, Compose definitions, migrations, tests and
deployment tooling. The following are intentionally not committed:

- `.env` credentials and service tokens;
- PostgreSQL and Redis volumes;
- retained market-data/runtime export volumes;
- browser-test administrator password;
- generated screenshot binaries and historical research exports.

Restore these from the approved protected configuration/volume backup. Never copy
credentials into Git.

## Clean-clone verification

```bash
git clone https://github.com/PM1288/Nifty-Backtesting_Q2-2026.git trading-stack
cd trading-stack
git checkout master
test "$(git rev-parse HEAD)" = "$(git ls-remote origin refs/heads/master | cut -f1)"
./scripts/verify_aligned_terminal_source.sh
```

The verifier deliberately runs `prisma generate` after the locked install and before
API compilation. A fresh clone has no generated Prisma client and API TypeScript
checks are not meaningful until that deterministic generation step completes.

Expected feature-release results are web 93/93, API 188/188 and both typechecks
passing. Counts may increase on later commits; failures must never be ignored.

This sequence was executed against a fresh shallow GitHub clone of `master` on
8 September 2026. The clone resolved to `90a2e36c759bf7499080d2b0847553139b75fb8a`;
after locked install and Prisma generation, both typechecks and all 281 tests passed.

## Canonical production deployment

Install the protected `.env` at the repository root, then deploy through the checked-in
helper so Compose supplies `/n50/` asset paths and does not recreate unrelated services:

```bash
cd /home/novius2/trading-stack
git fetch origin
git checkout master
git pull --ff-only origin master

ROUTE_PATH='/n50/strategy/trading-analytics?view=scalper&interval=5' \
  ./scripts/deploy_n50_dashboard.sh
```

Do not use a directory-derived Compose project name. The helper pins
`trading-stack-novius2`, builds `n50-dashboard`, deploys with `--no-deps --no-build`,
waits for health and verifies the routed Vite asset.

## Production acceptance

With the protected browser-test credential available through the existing `.env`:

```bash
cd /home/novius2/trading-stack
node tools/playwright/trading-analytics-terminal-package.mjs
```

Required result for this release:

```text
checks=39 passed=39 screenshots=14 runtimeErrors=0
```

Additional checks:

```bash
docker inspect -f '{{.State.Health.Status}} {{.RestartCount}} {{.Image}}' \
  trading-stack-novius2-n50-dashboard-1
curl -fsS -o /dev/null -w '%{http_code}\n' \
  'https://n50.nifty50today.co.in/n50/'
git status --short
git rev-parse HEAD
git rev-parse origin/master
```

Expected: `healthy 0`, HTTP `200`, identical local/remote SHAs, and no tracked-file
changes. Existing unrelated ignored/untracked runtime reports do not enter the image.

## Rollback

This release has no migration or data mutation. Roll back only the dashboard image or
revert the feature commit, rebuild through `scripts/deploy_n50_dashboard.sh`, and rerun
the acceptance suite. The user-level renderer fallback remains:

```text
?view=scalper&renderer=classic
```

## Known separate maintenance item

`npm audit --omit=dev` currently reports 16 pre-existing production dependency
advisories. Several fixes cross major versions. They require a dedicated security
compatibility release and must not be hidden inside a chart-layout deployment.
