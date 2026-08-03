# Package Modules

- `calendar`, `contracts`, `data`: point-in-time data/time boundary.
- `costs`, `features`, `strategy`, `simulation`: canonical economics and replay.
- `orchestration`, `evaluation`, `reporting`: resumable runs and governed results.
- `discovery`, `calibration`: leakage-controlled research and probability evidence.
- `options`, `live`: actual-premium option research and batch/online parity.

Legacy Go, Python, and TypeScript services consume these through adapters; they must
not fork fee, timestamp, feature, execution, or run-state rules.
