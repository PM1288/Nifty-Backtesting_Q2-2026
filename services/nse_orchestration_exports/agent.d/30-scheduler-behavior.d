Scheduler rules:
- one active run per job key
- use PostgreSQL advisory lock to avoid duplicate execution
- record stdout/stderr tails
- record duration_ms
- run quality checks after summary/export jobs
- allow manual runs via API for operators
