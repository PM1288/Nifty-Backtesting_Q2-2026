# Market workstation flow repair

Date: 20 September 2026  
Branch: `feat/market-workstation-flow-20260920`

## Scope and behavior

This is a presentation and read-only evidence repair. It does not alter MWHD,
OIIS, signal, paper-order or live-order rules.

### Scalper V2

- The underlying price pane renders only three semantic horizontal references:
  Today open, Yesterday close and Yesterday high, when they fall inside the
  observed session range.
- Selected CE/PE strike, ranked OI, max-pain and hover lines are removed from
  that pane. User drawings and explicit A/B measurement remain independent.
- The former price-aligned OI primitive is no longer supplied by the page. The
  compact side strike charts remain the OI/Change-in-OI surface.
- OI identity is CE yellow and PE blue. Green/red continues to represent signed
  change and candle direction, so identity and direction are not conflated.
- A native lower pane plots `sum(PE OI) - sum(CE OI)` for each retained chain
  timestamp. It shares the underlying time scale, uses its own value scale and
  incremental series updates, and does not substitute missing snapshots.

### Morning View and Home

- Net-call heat remains conventional: positive green, negative red.
- Net-put heat is intentionally inverse: negative green, positive red. The raw
  signed number and magnitude are preserved; only the visual interpretation is
  inverted.
- Home displays the existing Morning View cash, index-futures, index-options and
  final matrix state in the top lens bar through a read-only, narrowly projected
  summary endpoint. It does not load chain, candle, participant-history or
  resistance payloads merely to paint the headline.
- MWHD adds `Intraday volume`, calculated only for the MWD-qualified staged
  cohort. It compares the forming 15-minute bucket, time-normalised to a full
  bucket, with the mean of the previous 15 completed 15-minute buckets. It is
  optional evidence and does not change route qualification, weighting or rank.
- Progression snapshots refresh once per minute without a document reload.
  Existing SQL stage pruning prevents H/15m/5m work for failed prerequisites.

### Stock 360

The price-axis min/max is derived only from the visible chart OHLC, with equal
5% padding (and a small flat-session fallback). Remote Month/Week/Day reference
lines remain inspectable but cannot stretch the default price domain.

## Files changed

- API: overview progression query/model/tests, Morning View summary route, and
  previous-day-high reference-level construction/tests.
- Web: Scalper V2 native chart/page/analytics/CSS, Morning View heat semantics,
  Home progression table/models/API hooks/types, Home headline and Stock 360.
- Preservation: this report, feature manifest and `AGENT_HANDOFF.md`.

## Verification before release

- API: typecheck PASS; 253/253 tests PASS; production build PASS.
- Web: typecheck PASS; 222/222 tests PASS; production build PASS.
- `git diff --check`: PASS.
- `bash scripts/verify/canonical-repository-gate.sh`: PASS.

## Boundaries and known limits

- The 15-minute comparator uses retained one-minute bar volume. Missing history
  remains unavailable rather than zero.
- The Morning View headline is a summary of the authoritative Morning View
  calculation, not a new recommendation or trade action.
- The PE-minus-CE pane represents the retained tracked-strike cohort, not a
  claim of complete exchange-chain coverage.
- No schema migration, historical rewrite, broker request, order permission or
  collector change is included.

## Release evidence

Application commits `3c4aa93` and `dd1db31` are pushed to both `master` and the
feature branch. Rollback tag `before-market-workstation-flow-20260920` identifies
the preceding application release. The approved scoped deployment recreated
only `n50-dashboard`; it is healthy with zero restarts, image
`sha256:2dd1d451425ac5385cbd63eb0558e4e40214832adaa7711f8a8391d06402cf81`
and public entry asset `/n50/assets/index-g19vrKD3.js`.

Authenticated production Chromium passed 46/46 targeted checks across Scalper
V2, Morning View heat semantics, both Home rank boards, the Home headline and
Stock 360. The current weekend context contained zero timestamped chain-total
points, so the PE-minus-CE pane remained truthfully empty; adapter attachment,
label and missingness were verified, but this run is not evidence of a painted
live-market line.

A separate 76.6-second production regression recorded one document navigation,
the same three native chart roots, one initial candle `setData` per chart, no
rehydration and the expected two minute-poll requests. The targeted Morning View
summary endpoint returned HTTP 200 in 40ms after the narrow-query repair. No
post-deployment analysis-queue warning was observed in the checked log window.

Screenshots and machine-readable results are outside Git at
`/home/novius2/NIFTY50/evidence/market-workstation-flow-20260920/`.
