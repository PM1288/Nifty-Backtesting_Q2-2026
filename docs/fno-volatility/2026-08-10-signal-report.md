# F&O volatility signal report — 10 August 2026

## Run result

| Field | Result |
| --- | --- |
| Strategy | `FNO_VOLATILITY_TWO_GATE` 1.0.0 |
| Mode | PAPER / research |
| Completed daily source | 7 August 2026 |
| Active stock-option underlyings snapshot | 186 |
| Underlyings with sufficient daily history | 185 |
| Active option contracts | 2,200: 1,100 CE and 1,100 PE |
| Stage A shortlist | 15 |
| Stage B live shortlist | 0 (opening data stale at validation time) |
| Actionable signal | 0 |
| Final decision | `NO_TRADE` |

The post-close validation run correctly stopped Stage B before option ranking because the opening-bar window was stale at validation time. It did not reinterpret completed-session bars or repeated quote snapshots as live data.

The 15 pre-market shortlist rows remain research candidates only. There are no valid live candidates and no option recommendation for the closed session. The next governed 09:30–10:00 IST run will require at least five current opening bars, an underlying-bar age no greater than 180 seconds and two-sided CE/PE quotes no older than 120 seconds.

Run identities:

- Pre-market: `7c55cf45-f2d0-49dc-9190-9dbb724cc473`
- Post-close validation: `23439144-10ee-49f5-a5a4-0fb6f3daa695`
- Pre-market result hash: `ec4e94ad013c68e88f42e9c2d535a4b509b16815d756b6c8b021737b72140fd6`
- Post-close result hash: `75ec290d2c4aa10ad104a5ef78caeccafe66b898112d60a5db529bc9bdf60c7c`

The persistent scheduler subsequently produced the idempotent governed 08:30 snapshot and a separate post-close fail-closed diagnostic after deployment. No paper or live trade was submitted.
