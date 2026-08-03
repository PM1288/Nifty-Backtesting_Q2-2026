## Discord Market Stream

This integration posts a trust-gated market dossier from the existing `n50-dashboard` API service to Discord. It reuses the same `board-brief` payload the dashboard renders, so Discord summaries stay aligned with the on-screen analytics instead of running a separate analytics path.

### Architecture

- Sender lives in `neon-stock-terminal/apps/api`
- Source-of-truth snapshot is `GET /v1/analytics/board-brief`
- Discord stream is deterministic first and trust-gated before send
- Dispatch audit rows are stored in `audit.discord_stream_dispatch_log`
- Scheduler runs inside the dedicated `n50-discord-stream-dispatcher` container
- The web/API container keeps scheduler mode off by default

### Routes

- `GET /v1/discord-stream/health`
- `GET /v1/discord-stream/recent?limit=20`
- `POST /v1/discord-stream/preview`
- `POST /v1/discord-stream/test`
- `POST /v1/discord-stream/dispatch`

`preview` renders the Discord payload without sending. `test` always targets the test webhook. `dispatch` targets `test` or `prod` depending on the request body.

### Environment

- `N50_DISCORD_STREAM_ENABLED`
- `N50_DISCORD_STREAM_SCHEDULER_ENABLED`
- `N50_DISCORD_STREAM_SHADOW_MODE`
- `N50_DISCORD_STREAM_USE_WAIT`
- `N50_DISCORD_STREAM_INTERVAL_SECONDS`
- `N50_DISCORD_STREAM_COOLDOWN_MINUTES`
- `N50_DISCORD_WEBHOOK_URL_TEST`
- `N50_DISCORD_WEBHOOK_URL_PROD`
- `N50_DISCORD_THREAD_ID_TEST`
- `N50_DISCORD_THREAD_ID_PROD`
- `N50_DISCORD_THREAD_ID_MARKET`

Recommended local defaults:

```env
N50_DISCORD_STREAM_ENABLED=1
N50_DISCORD_STREAM_SCHEDULER_ENABLED=1
N50_DISCORD_STREAM_SHADOW_MODE=0
N50_DISCORD_STREAM_USE_WAIT=1
N50_DISCORD_STREAM_INTERVAL_SECONDS=1800
N50_DISCORD_STREAM_COOLDOWN_MINUTES=180
N50_DISCORD_WEBHOOK_URL_TEST=...
```

### Behavior

- Trust floor is currently `55`
- Cooldown is enforced on delivered payload hashes plus session reference
- Identical delivered session digests are suppressed even after cooldown windows
- `allowed_mentions.parse=[]` is always sent
- `wait=true` is used by default so test sends return Discord status synchronously
- Discord `429` responses respect `Retry-After` once before failing
- Sentiment markers are prefixed with emoji:
  - `🟢` bullish / supportive
  - `🔴` bearish / contrarian
  - `🟡` mixed / neutral / indecisive

### Local validation

Apply DB migrations first:

```bash
./scripts/db_migrate_all.sh
```

Rebuild the API stack, including the dispatcher:

```bash
docker compose --env-file .env -f compose/compose.base.yml -f compose/compose.dev.yml up -d --build n50-dashboard n50-discord-stream-dispatcher nginx
```

Preview the payload:

```bash
curl -X POST http://localhost:19090/n50/v1/discord-stream/preview \
  -H "Content-Type: application/json" \
  --cookie "n50-prod-session=<session-cookie>" \
  -d "{\"target\":\"test\"}"
```

Send a Discord test message:

```bash
curl -X POST http://localhost:19090/n50/v1/discord-stream/test \
  -H "Content-Type: application/json" \
  --cookie "n50-prod-session=<session-cookie>" \
  -d "{\"force\":true,\"reason\":\"manual validation\"}"
```

Inspect audit rows:

```sql
select id, message_kind, target, status, trust_score, created_at, sent_at
from audit.discord_stream_dispatch_log
order by created_at desc
limit 20;
```

### Safety notes

- Keep production webhook URLs in env only
- Use the test webhook for local and staging validation
- Rotate the webhook if it has been shared in chat or docs
- This stream is a summary/digest path, not a replacement for dashboard auth or alert policy review
