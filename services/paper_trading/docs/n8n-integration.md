# n8n integration

The endpoint and Basic credentials come only from environment variables. The worker sends `application/cloudevents+json`, delivery/event identifiers, attempt and sequence headers, and `X-Paper-Signature-256 = HMAC-SHA256(timestamp + '.' + raw_body)`. n8n should verify in constant time, reject stale timestamps and deduplicate event IDs in a durable Data Store or PostgreSQL table before routing.

Import `n8n/workflows/paper-trading-events-v1.json`, configure its environment-backed verification values and activate its production webhook. Never use a test webhook in deployment. n8n downtime does not roll back a trade; the durable outbox retries and dead-letters.
