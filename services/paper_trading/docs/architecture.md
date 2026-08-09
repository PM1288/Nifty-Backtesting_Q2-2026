# Architecture

One immutable image runs five commands: API, monitor worker, webhook worker, scheduler and migration. PostgreSQL is both the business system of record and the durable queue. Trade state changes, immutable events and outbox rows commit atomically. The monitor stores a per-instrument cursor and processes every bar in timestamp order. The outbox worker claims work with `FOR UPDATE SKIP LOCKED`, performs Basic authentication plus HMAC signing, retries transient failures and retains dead letters.

The live collector and its tables are never modified. The service has no broker adapter or LIVE state. `PAPER_TRADING_ONLY=true` is a startup gate.
