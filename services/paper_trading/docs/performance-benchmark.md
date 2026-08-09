# Performance benchmark

Run on 2026-08-09 with Python 3.12.3 on Linux 6.8 x86-64: 500 symbols × 375 bars = 187,500 bars and 562,500 independent target evaluations completed in 0.7735 seconds (242,420 bars/second; 727,260 target evaluations/second). Reported process maximum RSS was 449,180 KiB. Reproduce with `.venv/bin/python tools/benchmark.py`.

This is the deterministic CPU calculation benchmark, not a PostgreSQL/outbox soak. The disposable PostgreSQL end-to-end smoke proves transactional correctness at small volume. Before materially increasing active tracks, run a production-like staged database/webhook backlog soak and record monitor lag, query count, outbox throughput, summary time and relation growth. PostgreSQL batching and indexes remain the first optimisation path; the result does not justify an external queue.
