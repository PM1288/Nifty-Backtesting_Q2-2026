# Performance and density evidence

## Before

The legacy Today screenshot uses a document-length heatmap and continues below the first viewport. Baseline images are in `current-screenshots/`.

## After

Test fixture: 19 sectors, 152 stocks. At 1920×1080 and 1440×900 the Summary and Full Board both measured zero browser-level vertical scroll. The contained board virtualiser mounted 96/152 tiles at 1920 and 72/152 at 1440. At 1024 it mounted 40/152 and at 390 it mounted 32/152. Inactive Summary lenses are conditionally rendered, no stock tile owns a chart, and all pages reuse the existing overview/live snapshot cache.

The deterministic fixture run cannot provide representative production network timings or websocket performance. Those require authenticated deployment UAT.
