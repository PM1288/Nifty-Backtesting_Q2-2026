# Security

The container runs as UID 10001, read-only, with all capabilities dropped. No broker credentials or adapter are accepted. Bearer tokens are compared as SHA-256 hashes and webhook secrets are redacted Pydantic secrets. The production Compose publishes only the API on loopback and does not publish PostgreSQL.

Use `migrations/roles.example.sql` as the administrator-reviewed template for separate migration and application roles. It grants the application read-only access to `public.bars_1m` and `public.instruments`, and write access only to `paper_trading`. Set role passwords out-of-band and replace the database name if the deployment differs.
