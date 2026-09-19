# Home MWHD optional projected-volume confirmation

Date: 19 September 2026  
Route: `/n50/`  
Scope: existing Home `SCALPER PROGRESSION · MWHD RANK` Bull and Bear boards

## Outcome

Both independent rank boards now expose an optional `V20 opt.` confirmation
cell. It shows the projected full-session stock volume as an exact multiple of
the prior 20 completed daily sessions' simple average, for example `~ 1.5×` or
`✓ 2.4×`.

This is display evidence only. It does not add a strategy gate, change either
Bull/Bear comparison, alter weighted scores, qualify a stock, or affect either
direction's rank. The column can be hidden with the `V20 optional` control.

## Calculation

The daily reference is:

```text
volumeSma20 = mean(volume for the 20 completed daily sessions before today)
```

For a same-session observation between 09:15 and 15:30 IST:

```text
elapsedMinutes = observation time - 09:15 IST
sessionProgress = clamp(elapsedMinutes / 375, 1/375, 1)
projectedFullDayVolume = currentCumulativeSessionVolume / sessionProgress
displayMultiple = projectedFullDayVolume / volumeSma20
```

The quote observation timestamp is used, not the browser wall clock. A retained
completed-session observation uses actual completed volume divided by the same
prior-20-session average and is not extrapolated again. Before-session,
invalid, missing, negative or zero-denominator inputs remain unavailable.

## Visual bands

| Multiple | Presentation | Meaning |
| ---: | --- | --- |
| `>= 3.0×` | strong green `✓` | well above the requested confirmation |
| `>= 2.0×` | green `✓` | requested confirmation reached |
| `>= 1.5×` | strong yellow `~` | approaching confirmation |
| `>= 1.0×` | yellow `~` | at/above normal pace, below confirmation |
| `>= 0.5×` | red `×` | below normal pace |
| `< 0.5×` | strong red `×` | materially below normal pace |
| unavailable | neutral `—` | evidence is absent or invalid |

The selected-stock evidence drawer shows current captured volume, projected
full-day volume, prior-20-session SMA and the exact multiplier. The full CSV
adds the same raw inputs and computed multiple.

## Source and missingness

- Current volume is the canonical NSE stock cumulative session volume retained
  on the quote observation.
- Daily SMA uses `bars_1d` rows ranked by trade date and explicitly excludes the
  latest/current daily row (`rn BETWEEN 2 AND 21`).
- SQL no longer coerces a missing stock volume to zero on this response path.
- No market data, MWHD arithmetic, OIIS evidence, paper/live order permission or
  alerting behavior is changed.

## Validation

- API numerical test covers same-session 2.0× and 1.0× projections,
  completed-session actual volume and missing/invalid inputs.
- Web numerical tests cover the threshold bands and unavailable state.
- Authenticated candidate Playwright covers both boards, exact multipliers,
  optional hide/show behavior, unchanged ranks/scores, drawer evidence, ten-row
  desktop density and contained mobile horizontal scrolling.

Screenshots and browser evidence are retained outside Git under
`/tmp/home-mwhd-volume-candidate/` during this release run.

