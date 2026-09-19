# Home MWHD staged funnel — 19 September 2026

## Outcome

The Home MWHD board now loads ten Bull ranks and ten Bear ranks initially. The
remaining ranked universe stays available through an explicit `Load remaining`
control. The collapsible Trading shortlist contains a separate Bull/Bear funnel
with `Tracked → MWD → H → 15m → 5m` counts and up to ten highest-stage passed
stocks per direction. Intermediate candidates are research context; only the
existing fully qualified/OIIS rules enter the Long/Short shortlist.

## Calculation boundary

The existing monthly, weekly and daily comparisons and weights are unchanged.
Evaluation is now fail-closed and sequential for each Bull/Bear route:

1. MWD prerequisites must all pass before H is evaluated.
2. H must pass before 15m is evaluated.
3. 15m must pass before 5m is evaluated.
4. A skipped deeper stage is unavailable, never a failure or zero.

The API applies the same pruning before reading intraday buckets. It resolves
the latest real NSE session from weekday 09:15–15:30 IST one-minute evidence,
so weekend/off-session rows cannot displace the last valid session. Hourly,
15-minute and 5-minute values use contiguous clock buckets from that session.
The client polls every 30 seconds. A production warmer and 30-second
stale-while-refresh cache coalesce identical requests, keep the five-minute
stage current within the polling interval and prevent multiple Home consumers
from repeating the same query.

No strategy formula, weight, order path, OIIS selection rule or personal-list
qualification was changed. MWD anchors are daily/period values; they are not
materialized as a new database snapshot by this repair.

## Performance evidence

The prior live-shaped endpoint measurements were approximately 12.2–12.6
seconds per request. An early optimization incorrectly admitted off-session
Saturday rows; browser/data inspection caught this before release. The final
session resolver returns the 18 September session with 43 paired hourly rows,
16 eligible 15-minute rows and 12 eligible 5-minute rows in the inspected
cohort. Cold computation varied with database load (roughly 4–8 seconds), while
the production-shaped prewarmed request completed in 0.012 seconds and the
direct cached request in 0.006 seconds. Concurrent cold requests are coalesced
into one computation.

## Validation

- Web: typecheck, 216/216 tests and production build passed.
- API: typecheck, 247/247 tests and production build passed.
- Focused MWHD tests cover sequential stage stopping, missingness, independent
  Bull/Bear ranks and funnel counts.
- Candidate Playwright progression: 20/20 checks passed at desktop/mobile.
- Candidate Trading shortlist: 10/10 interaction groups passed, including
  monotonic funnels, top-ten passed candidates, mobile containment, persistence,
  idle close and Escape.
- Screenshots/results (not committed): `/tmp/mwhd-progression-final/` and
  `/tmp/mwhd-sidebar-release/`.

## Rerun

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

PLAYWRIGHT_BASE_URL=https://n50.nifty50today.co.in/n50 \
PLAYWRIGHT_AUTH_BASE_URL=https://n50.nifty50today.co.in/n50 \
PLAYWRIGHT_AUTH_ORIGIN=https://n50.nifty50today.co.in \
PLAYWRIGHT_ADMIN_PASSWORD='<protected environment value>' \
PLAYWRIGHT_OUTPUT_DIR=/tmp/mwhd-progression-production \
node tools/playwright/today-scalper-progression.mjs

PLAYWRIGHT_BASE_URL=https://n50.nifty50today.co.in/n50 \
PLAYWRIGHT_OUTPUT_DIR=/tmp/mwhd-sidebar-production \
node tools/playwright/home-trading-shortlist.mjs
```

## Rollback and limitations

Rollback the scoped dashboard release to the pre-release tag/image. No schema
migration or data rewrite is involved. The funnel reports the latest retained
valid NSE session on non-trading days; it does not claim that Saturday is a live
market session. A production browser check is required after deployment and is
recorded in the handoff rather than inferred from the candidate checks.

## Production release

Application commit `72df09d` was pushed to the feature branch and `master`.
Rollback tag `before-home-mwhd-funnel-20260919` identifies the prior release.
The approved scoped deployment recreated only `n50-dashboard`; container
`771b23bdffc3...` is healthy on image `sha256:c5d9138e59e...`, with entry asset
`/n50/assets/index-DgIc_QJi.js`. Authenticated public Chromium passed all 20
progression checks and all 10 shortlist interaction groups. The desktop capture
was visually inspected and showed Bull `210 → 16 → 11 → 8 → 8` and Bear
`210 → 27 → 5 → 4 → 4` for the retained 18 September 2026 session. Evidence is
outside Git at `/tmp/mwhd-progression-production/` and
`/tmp/mwhd-sidebar-production/`. No database, collector, strategy or order
service was recreated or modified.
