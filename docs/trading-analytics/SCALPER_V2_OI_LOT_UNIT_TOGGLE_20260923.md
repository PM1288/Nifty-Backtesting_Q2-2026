# Scalper V2 OI lot-unit display toggle — 23 September 2026

## Outcome

Scalper V2 now exposes one persistent workspace-level OI display selector:

- `Contracts` retains the canonical source values.
- `× Lot N` displays underlying-equivalent units as `contract OI × exact F&O lot size`.

The current NIFTY expiry resolves an exact common lot size of 65 from the
retained NFO instrument master. The multiplier is not a UI constant.

## Scope

The selected unit applies together to:

- OI and signed change-in-OI by strike;
- the selected CE/PE metrics and chain/profile tables;
- OI leaders, structure ribbon and Option Structure Matrix;
- the Strike Structure chart;
- CE and PE total OI history;
- cumulative PE OI minus CE OI;
- cumulative PE change-in-OI minus CE change-in-OI;
- all associated axes, tooltips, expanded charts and visible summaries.

PCR, rank identity, percentage change, imbalance ratios, heatmap shares, max
pain candidates and strategy calculations retain their canonical arithmetic.
Multiplication by one positive common factor cannot change those identities,
and the implementation does not rewrite source data.

## Truthfulness guard

The `× Lot` control is enabled only when every observed row is explicitly
contract-denominated and the exact cohort has one common positive lot size.
Provider-native/unverified OI is never multiplied because it could already be
underlying-unit denominated. Missing values remain missing and are not changed
to zero.

The selected display preference is stored in browser local storage. JSON export
adds the selected display mode, source unit, exact lot size and multiplier while
retaining the canonical raw source payload.

## Acceptance

- A 100-contract observation at lot size 65 displays as 6,500 underlying units.
- A signed change of -10 displays as -650.
- CE/PE cumulative components and both difference fields use the same factor.
- Null OI/change values remain null.
- Contracts mode remains byte-for-byte numerically identical to the prior view.
- Mixed lot sizes or non-contract source units disable `× Lot`.
- Switching units performs no network request and does not remount price charts.
