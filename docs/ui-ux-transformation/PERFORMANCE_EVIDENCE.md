# Performance Evidence

Last updated: 2026-08-11 19:06 UTC.

## Implemented hardening

- Routes remain lazy-loaded; inactive data-heavy pages/charts are not mounted by the shell.
- The application shell subscribes only to the three compact index instruments, not every stock quote.
- Home preserves stable stock positions and selector-scoped updates rather than replacing global application state on every tick.
- Large specialist views use bounded/advanced tables; the canonical first viewport avoids mounting the entire raw universe where a shortlist is available.
- WebSocket updates carry a connection-local sequence; duplicates/gaps trigger recovery rather than uncertain derived state.
- Startup snapshot materialisation is serialised and de-duplicated in `snapshotRegistry.ts`. This removed the previous simultaneous prewarm burst that exhausted the Prisma connection pool.
- The final container reached healthy state after each rebuild; startup logs contained no connection-pool or snapshot-scheduler failure.

## Production build footprint

The final build transformed 2,467 modules. Principal compressed chunks reported by Vite:

- application entry: 111.04 kB gzip;
- ECharts vendor: 159.77 kB gzip;
- Firebase vendor: 95.62 kB gzip;
- query vendor: 14.97 kB gzip;
- Paper command center route: 8.87 kB gzip;
- OIIS Live route: 10.35 kB gzip;
- Options Intelligence route: 5.97 kB gzip.

The chart/vendor chunks remain substantial but are split from route code.

## Behavioural load proxy

- 208-stock, 19-sector Home live-data test: 21/21.
- Nine-viewport navigation matrix: 118/118 with no stuck sheet/listener symptom after 25 More open/close cycles.
- Canonical route matrix: 24/24 with no console/API errors or horizontal overflow.
- No duplicate snapshot-prewarm work was observed after the serial scheduler change.

## Open performance evidence

A multi-hour browser heap/session soak, p95 route/navigation timings across Chromium/Firefox/WebKit and mobile background/foreground memory profiling have not been completed. No SLO is claimed from screenshots alone. These remain release-hardening work.
