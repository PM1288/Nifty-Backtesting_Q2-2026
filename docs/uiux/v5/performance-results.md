# Compact UI V5 performance and density results

## Rendering changes

- Heavy Paper Trading lenses are conditionally mounted; Overview no longer mounts Factor, Capital, Path, Reward/Pain and Scenario canvases simultaneously.
- Existing Vite route-level lazy chunks remain unchanged.
- Long ledgers retain bounded/internal scrolling and existing progressive loading.
- Shared CSS tokens replace route-specific whitespace without adding runtime layout measurement.
- Stock universe controls are colocated rather than repeated in a second panel.

## Representative measurements

| Route / viewport | Before height | V5 height | V5 chrome | Evidence note |
|---|---:|---:|---:|---|
| Monthly / 1440×900 | 2,021 px | 1,209 px | 95 px | 250 rendered rows; table begins after one context and KPI strip |
| Rolling / 1440×900 | 1,816 px | 1,058 px | 95 px | duplicate universe/concentration surfaces removed |
| Paper Simple / 1440×900 | part of 8,603 px workbench | 1,040 px | 95 px | 44 filtered records; contained evidence surface |
| Trendlyne / 1920×1080 | large hero baseline | 2,998 px full ledger | 95 px | two charts begin in first viewport; complete tables retained below |

The global desktop shell measures 95 px in the Playwright DOM audit, within the 94–104 px target. The permission-aware Control Plane omits primary navigation and measures 59 px. The complete sweep reports no viewport-level horizontal overflow across 220 route/viewport checks.

Inactive Paper Trading analytical lenses are absent from the DOM: Overview reports only `overview`, and the dedicated Factor, Capital, Path, Reward/Pain, Scenario and Audit routes each report only their selected section in the supplemental lens audit. This prevents the former all-sections-at-once chart cost without changing any calculation or source payload.

## Loading caveat

Paper Trading intentionally paints the durable accounting summary before its larger detailed path payload. The audit waits up to 120 seconds for the settled Overview and records the interim state honestly. V5 does not change the backend query or canonical calculation pipeline.
