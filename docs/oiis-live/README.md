# OIIS Live paper-selection service

## Outcome

OIIS Live converts the governed daily OIIS opportunity screen into a durable,
editable paper-entry watchlist.  It is intentionally not a broker integration.
The service runs in `PAPER` mode, uses PostgreSQL for all durable state, and
submits idempotent intents to the universal paper-trading API.

The UI route is `/strategy/oiis-live`.  It shows daily candidates, O/X/DQ,
monitor versus entry permission, buy reference, RSI/Williams %R thresholds,
entry state, paper state, error counts, and durable service heartbeats.  Users
may add, edit, disable, or remove a row.  Enabling a non-canonical manual row is
an explicit operator override and is labelled as such in the paper intent.

The read-only dashboard endpoint `GET /v1/oiis-live/dashboard` is intentionally
available without a session so the page and service diagnostics do not fail
with `AUTH_REQUIRED`.  Watchlist mutations and operational commands remain
behind the shared authentication guard because they can change paper-trading
state.

## Governed flow

1. At 08:40 Asia/Kolkata on each weekday, or on restart after 08:40, select the
   latest completed daily session for the current trade date.
2. Admit a HIGH, MEDIUM, or LOW daily candidate only when DQ is at least 85,
   permission is `FULL`, and no daily hard gate is unresolved.
3. Add the candidate to `oiis_live.watchlist_item`.  Daily selection is
   deterministic and safely replaces only that day's generated rows; manual
   rows are retained.
4. The SmartAPI collector merges all active OIIS watchlist symbols into its
   dynamically prioritised subscription set, before derivative overflow.
5. Only a canonical row (`O >= 74`, `X >= 76`) is automatically entry-enabled.
   A daily level is screening context, not trade authorisation.
6. During the session, process every stored one-minute bar in order.  The first
   completed condition with RSI(14) `< 30` and Williams %R(14) `< -80` claims
   the symbol/date atomically.
7. The unique `(policy_id, trade_date, symbol)` constraint guarantees no more
   than one OIIS entry for one stock on one day across restarts and workers.
8. Submit a `PAPER` market intent for the next eligible bar open.  A later day
   may open another independent position in the same symbol.
9. Actual execution exits are `I030`: +0.30% during D0; otherwise `S100`: +1%
   from D+1 onward.  There is no stop, forced square-off, D+5 timeout, or
   run-end liquidation.
10. Independent diagnostic tracks continue for intraday +0.30/+0.50/+0.70%,
    D+5 +1/+2/+5%, adverse excursion, and 5/30-session observations.  A lower
    target never truncates a higher target.

## PostgreSQL map

The additive migration is `db/sql/032_oiis_live.sql`.  Important objects:

- `oiis_live.selection_run`: immutable selection-run identity and counts.
- `oiis_live.daily_candidate`: all evaluated daily evidence and conditions.
- `oiis_live.watchlist_item`: generated/manual editable trade-date list.
- `oiis_live.intraday_evaluation`: every evaluated minute and indicator result.
- `oiis_live.entry_claim`: idempotency lock, request and paper response.
- `oiis_live.command_queue`: UI-to-worker durable commands.
- `oiis_live.service_heartbeat`: durable readiness evidence.
- `oiis_live.error_outbox`: deduplicated retrying error notifications.
- `oiis_live.historical_run` and `historical_trade`: report provenance.
- `oiis_live.v_current_watchlist` and `v_service_diagnostics`: UI views.

Paper execution, fills, lifecycle targets, costs, 35% management tax provision,
observations and outbound n8n events remain in `paper_trading.*`.

## Failure containment

- Paper mode is mandatory; no live broker path exists.
- Database uniqueness prevents duplicate same-day entries.
- Paper API idempotency prevents duplicate orders after a network retry.
- Cursor-based market processing prevents skipped bars after a restart.
- Swing execution targets are excluded on D0 by the lifecycle field.
- Missing/stale data creates no invented price or trade.
- Selection, manual edits, requests and responses remain auditable in Postgres.
- Error delivery is asynchronous, deduplicated by hourly error fingerprint,
  retried with backoff, and sent to the configured Mattermost-compatible hook.
- The UI does not mount the Docker socket.  It presents application readiness,
  data freshness and queue health; operators inspect container state with the
  safe read-only command below.

## Commands

From the accepted repository:

```bash
./scripts/db_migrate_all.sh
./scripts/deploy_n50_dashboard.sh
docker build -t trading-stack-oiis-live:1.0.0 -f services/oiis_live/Dockerfile .
docker compose -p trading-stack-novius2 \
  -f /home/novius2/trading-stack/docker-compose.yml \
  -f /home/novius2/trading-stack/compose/compose.paper-trading.yml \
  -f /home/novius2/trading-stack/compose/compose.oiis-live.yml up -d oiis-live
./scripts/oiis_stack_status.sh
```

Always deploy the N50 web application with `./scripts/deploy_n50_dashboard.sh`
or the equivalent `docker compose ... build n50-dashboard` command.  A plain
`docker build` omits the Compose-provided `VITE_BASE_PATH=/n50/` argument.  The
server can then appear healthy while browsers fail because its JavaScript and
CSS URLs incorrectly point to `/assets/` instead of `/n50/assets/`.  The safe
script builds, deploys only this service, waits for container health, loads the
routed OIIS page and verifies its entry bundle through nginx.

Run or test selection without exposing credentials:

```bash
docker compose -p trading-stack-novius2 -f /home/novius2/trading-stack/docker-compose.yml \
  -f /home/novius2/trading-stack/compose/compose.paper-trading.yml -f /home/novius2/trading-stack/compose/compose.oiis-live.yml exec oiis-live \
  oiis-live select --signal-date 2026-08-07 --trade-date 2026-08-10
docker compose -p trading-stack-novius2 -f /home/novius2/trading-stack/docker-compose.yml \
  -f /home/novius2/trading-stack/compose/compose.paper-trading.yml -f /home/novius2/trading-stack/compose/compose.oiis-live.yml exec oiis-live \
  oiis-live monitor-once --trade-date 2026-08-10 --no-submit
docker compose -p trading-stack-novius2 -f /home/novius2/trading-stack/docker-compose.yml \
  -f /home/novius2/trading-stack/compose/compose.paper-trading.yml -f /home/novius2/trading-stack/compose/compose.oiis-live.yml exec oiis-live \
  oiis-live reconcile
```

Run a bounded historical review:

```bash
python platform/nifty_stratlab/tools/run_oiis_live_backtest.py \
  --start 2023-08-01 --end 2026-08-07 \
  --output-dir outputs/oiis_live_2023_2026_corrected
```

The runner uses the database only when `DATABASE_URL` is supplied, never logs
the DSN, and creates consolidated CSV, XLSX, JSON and Markdown results.

## Operator cautions

- `Entry enabled` on a manual/non-canonical row is powerful.  The UI and event
  evidence identify it as an operator override; use it only for paper testing.
- Target-hit percentages are path diagnostics, not additive portfolio returns.
- A 35% tax amount is a configurable management provision, not tax advice.
- Authentication remains enabled for watchlist mutations.  Do not publish an
  unauthenticated editable trading route.
