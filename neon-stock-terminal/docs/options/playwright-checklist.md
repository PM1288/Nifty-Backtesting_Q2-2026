# Option Chain Playwright Checklist

## Route

- `/options`

## Local tabs

- `Snapshot`
- `Equilibrium`
- `ATM Combo`
- `Diagnostics`

## Viewports

- `1920x1080`
- `1366x768`
- `390x844`

## Required checks

1. page loads without console errors
2. selected expiry visible
3. ATM strike visible
4. strike-window explanation visible
5. Snapshot tab:
   - OI chart visible
   - IV chart visible
   - ladder table visible
6. Equilibrium tab:
   - title visible
   - CE and PE lines visible
   - legend visible
   - gold markers visible when present
7. ATM Combo tab:
   - combo chart visible
   - open reference line visible
   - delta histogram visible
8. Diagnostics tab:
   - freshness visible
   - missing CE/PE counters visible
   - query/cache mode visible
9. footer/disclaimer does not overlap charts or table
10. mobile view keeps tabs usable and charts readable

## Sample validation target

Compare one sampled timestamp/session against the legacy reference only as a tolerance check:

- same expiry
- same ATM strike
- same strike window
- same CE/PE aggregate shape
- same ATM combo level within acceptable tolerance
