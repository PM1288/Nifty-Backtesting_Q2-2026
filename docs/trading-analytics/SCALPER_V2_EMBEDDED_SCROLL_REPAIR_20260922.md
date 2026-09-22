# Scalper V2 embedded-route scroll repair

Date: 22 September 2026  
Route: `/n50/strategy/trading-analytics?view=scalper_v2`

## Reported defect

The normal Trading Analytics Scalper V2 route showed the primary chart area but
could not scroll to its lower rows. The dedicated `popout=scalper_v2` page had
already been repaired and remained independently scrollable.

## Root cause

`TradingAnalyticsPage.module.css` deliberately constrains the Scalper route to
the available application viewport and hides overflow so the global document
does not move behind the terminal. Once Scalper V2 gained lower chart rows, its
direct child became taller than that fixed grid row. The fixed parent continued
to clip the child, but the child did not own an internal vertical scroll path.

## Repair

The normal, non-pop-out Scalper V2 child now fills the second grid row and owns
`overflow-y: auto`. Horizontal overflow remains contained, scrollbar space is
reserved, and overscroll is kept within the workstation. The compact parent
header therefore stays visible while all lower V2 rows can be reached.

The pop-out selector remains separate and retains its normal document scroll.
No chart height, data model, source value, strategy rule, order control or
refresh behavior changed.

## Regression coverage

`tools/playwright/scalper-v2-popout-structure.mjs` now tests both paths:

1. the embedded V2 child has a larger scroll height than client height;
2. programmatic vertical scrolling changes its scroll position;
3. the lower OI-history row enters the embedded viewport;
4. the pop-out document independently scrolls to its lower content.

Preview validation at 1920x1080 passed 48/48 authenticated browser checks. The
embedded workstation measured `scrollHeight=2072`, `clientHeight=955` and a
positive scroll range of `1117px`.

After release, authenticated production Chromium again passed 48/48 checks.
The embedded container measured `scrollHeight=2072`, `clientHeight=955`,
`overflow-y=auto` and scrolled `676px` to place the OI-history row inside the
visible workstation. The independent pop-out document also retained a positive
`1120px` scroll position.

## Rollback

Revert the release commit and recreate only `n50-dashboard`. No database or API
rollback is required because this is a CSS/test-only change.
