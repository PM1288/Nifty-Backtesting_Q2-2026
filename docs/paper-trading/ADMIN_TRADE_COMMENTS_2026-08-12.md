# Paper Trade Admin Comments

Implemented and deployed on 12 August 2026 (UTC).

## Outcome

The **All Paper Trades** surface now contains a private **Admin comments** column. Administrators can open a trade, select the **Comments** tab, add a note of up to 2,000 characters, and review the durable comment history. The latest comment and count are shown in the table; comment text is searchable from the existing trade search.

Comments are deliberately excluded for ordinary and unauthenticated users. This is enforced by the API, not only by hiding UI controls.

## Persistence

Migration `008_admin_trade_comments.sql` adds `paper_trading.trade_comments`:

| Column | Purpose |
| --- | --- |
| `comment_id` | Immutable UUID identifier |
| `trade_group_id` | Equity paper-trade group; cascades only when its parent trade is deleted |
| `author_uid` / `author_email` | Administrator identity captured at write time |
| `body` | Trimmed, non-empty comment, maximum 2,000 characters |
| `created_at` / `updated_at` | Durable PostgreSQL timestamps |

The table is indexed by trade and descending creation time. Migration execution is idempotent and recorded as `008_admin_trade_comments` in `paper_trading.schema_migrations`.

## API contract and permissions

- `GET /v1/workspace/paper-trading` adds `permissions.can_manage_comments`. Comment counts/latest text are included only for administrators.
- `GET /v1/workspace/paper-trading/trades/:tradeGroupId` adds `comments` and the same permission object. For non-admins, comments are an empty array.
- `GET /v1/workspace/paper-trading/trades/:tradeGroupId/comments` requires an administrator session.
- `POST /v1/workspace/paper-trading/trades/:tradeGroupId/comments` requires an administrator session, a valid CSRF token, an equity paper trade, and a valid body.
- Successful writes create a `PAPER_TRADE_COMMENT_CREATE` entry in the existing `paper_trading.request_audit` trail without storing the comment body in the audit payload.

Unauthenticated GET and POST attempts return HTTP 401. A logged-in non-admin is rejected with HTTP 403 by the shared server-side role predicate. No paper execution, target, quantity, P&L, observation, webhook, or broker-order logic was changed.

## Verification

- API TypeScript typecheck: passed.
- API tests: 71/71 passed in the canonical tree.
- Web TypeScript typecheck: passed.
- Web tests: 13/13 passed.
- Disposable PostgreSQL migration/idempotency test: 1/1 passed.
- Live migration: table exists and migration version is registered.
- Authenticated Playwright regression: 65/65 checks passed, including save, detail reload, full browser reload, table visibility, mobile rendering and typography.
- Unauthenticated endpoint checks: GET 401; POST 401.
- Production dashboard container: healthy after rebuild.

Evidence directory:

`/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/tools/playwright/output/playwright/paper-trading-command-center/`

The comment-specific screenshot is:

`/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/tools/playwright/output/playwright/paper-trading-command-center/paper-admin-comments-1920x1080.png`

## Rollback

The UI/API can be rolled back independently; the additive table may remain safely unused. Disabling or rolling back this feature does not require deleting comments or changing paper-trading services. Do not drop the table in a routine rollback because it contains administrator-authored records.
