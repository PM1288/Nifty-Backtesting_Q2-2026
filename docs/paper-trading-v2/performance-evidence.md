# Paper Trading Evidence Workbench V2 performance evidence

Measured: 2026-08-22 17:56 UTC
Environment: production public HTTPS route, headless Chromium, 1366 × 768, server-local network
Population: 35 paper trades

## Measurements

| Measurement | Result |
|---|---:|
| Paper workspace API samples | 2,765.8; 2,524.3; 1,723.8; 1,721.4; 3,630.4 ms |
| API median | 2,524.3 ms |
| API maximum | 3,630.4 ms |
| Route to workbench heading | 3,538.6 ms |
| First paint | 168 ms |
| First contentful paint | 412 ms |
| Paper Trading route JS gzip | 42.21 KB |
| Paper Trading CSS gzip | 19.77 KB |

Machine-readable result: `performance/performance-results.json`.

## Interpretation

The client paints promptly once navigation begins and the V2 additions did not add a new charting or grid dependency. The canonical Paper Trading API remains the dominant latency. The measured median and route-to-meaningful-heading result exceed the proposed 1.5-second target, so the performance acceptance gate is not complete.

## Follow-up

- Profile the workspace route query plan and connection-pool wait time.
- Remove avoidable sequential database work without changing formula ownership.
- Add a multi-hour market-session soak and memory/listener measurements.
- Run representative broadband tests in Chromium, Firefox and WebKit.
- Introduce row virtualisation when the population materially exceeds the current 35 rows.
