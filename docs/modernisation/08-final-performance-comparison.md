# Performance and footprint comparison

Date: 2026-08-09 UTC

This report covers the completed strategy-lab batch. It is not a claim that
the entire stack modernisation is complete.

| Measure | Before | After this batch | Result |
|---|---:|---:|---|
| Interactive strategy-lab worker | Not available | 62.26 MiB idle, 0.00% CPU sample | Bounded 1 GiB/1 CPU service |
| Production dashboard | Existing service | 55.20 MiB idle, 0.00% CPU sample | No observed idle regression |
| Staging dashboard | Existing optional service | 33.32 MiB idle, 0.00% CPU sample | Safe staging verification path |
| Nginx | Existing service | 4.56 MiB idle, 0.00% CPU sample | Retained |
| Strategy-lab JS chunk | None | 12.90 KiB, 4.65 KiB gzip | Route-lazy loaded |
| Strategy-lab CSS chunk | None | 4.13 KiB, 1.27 KiB gzip | Route-scoped |
| Default long-running service count | 25 observed | 26 with lab worker | Intentional additive worker; broader consolidation deferred |

The fixed one-stock smoke completed and exported one consolidated CSV. The
₹16 lakh finite-capital smoke created 159 daily-equity points and reconciled
trade P&L to ending capital. A full Nifty100/three-year benchmark was not run
because this batch was expressly bounded to implementation and one-stock
validation.

The Vite build still reports 13 dependency advisories (eight moderate, three
high and two critical). No unreviewed major-version audit fix was applied in
the same behavioural change. Dependency remediation remains a separate tested
batch.

Three inactive optional Nginx upstreams (`watchlist`, `matomo` and
`rsi-willr-monitor`) currently generate DNS-resolution errors. They do not
affect the N50 production/staging lab routes, but prevent an all-stack health
claim.
