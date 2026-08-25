# Rolling Monthly data-integrity and strategy review

**Reviewed:** 13 August 2026
**Decision:** historical quality evidence remains **BLOCKED_DATA_QUALITY_REBUILD**. The current live scanner may operate only as a research surface with explicit data-quality state. It is not approved for Paper Trading or broker execution.

## Executive conclusion

The supplied review correctly identified three different defects that must not be blended into one performance claim:

1. the old five-year CSV has a material exchange-session gap;
2. a current signal and a matured D+5/D+30 outcome are different populations;
3. a confirmed close signal cannot use the same session's open as its entry.

The current PostgreSQL estate is newer than the reviewed ZIP. Canonical `public.bars_1d` now contains the previously missing June-July and 10-12 August sessions for the active universe. Consequently, the old statement that PAYTM, MPHASIS, DALBHARAT and OFSS are still absent is not current: the repaired confirmed scanner finds those names. This correction is derived from canonical bars and the scanner, not from a hard-coded symbol allow-list.

The old research evidence is still unsafe. Its source CSV ends on 7 August, has only 12 equity rows per session from 12 June through 17 July while normal sessions contain about 230, and contains probable duplicate economic history for `LTIM` and `LTM`. No score threshold, candidate, winner or outcome has been hard-coded to compensate.

## Reconciliation of the August cohort

Using canonical PostgreSQL daily bars and the existing six-condition scanner:

- 15 of the reviewed 18 names qualify on 3 August and use 4 August open as the confirmed-strategy entry;
- HYUNDAI qualifies on 4 August and uses 5 August open;
- BOSCHLTD qualifies on 5 August and uses 6 August open;
- MANAPPURAM remains rejected because the daily close is not greater than the previous trading session's open.

This differs from the older raw-scanner count of 13 because the canonical database has since been repaired. The screenshot's arithmetic can be correct while its entry timing is incompatible with the confirmed strategy.

## Strategy identities

These must remain separate:

| Strategy model | Information cutoff | Entry | Status |
|---|---|---|---|
| Month-end candle | completed month-end close | next session open | Not implemented; requires an independent specification and backtest |
| Confirmed rolling monthly | signal-session close after all six conditions | next valid session open | Implemented as `CONFIRMED_CLOSE_NEXT_SESSION_OPEN` |

The implemented model records:

- `signal_model = CONFIRMED_CLOSE_NEXT_SESSION_OPEN`;
- `signal_information_cutoff = SIGNAL_SESSION_CLOSE`;
- `entry_price_source = NEXT_VALID_SESSION_OPEN`.

No month-end-open result is combined with the confirmed strategy.

## Corrections implemented

### Exchange-session completeness

The engine now validates every observed period against the canonical NIFTY session set before using monthly or weekly aggregates. It emits stable reasons for incomplete previous month, two-month lookback, current week, previous week, previous session and next session.

Missing next-session entry data does **not** erase a valid signal. The signal remains a live candidate with an unavailable entry state. It cannot become executable until a valid next-session open exists.

Missing signal-time inputs do block qualification. Missing data is never treated as a failed price condition, a zero, or a negative outcome.

### Calendar recovery

Migration `042_rolling_monthly_evidence_governance.sql` adds missing trading dates to the exchange calendar only when a canonical NIFTY daily bar exists. It does not overwrite recorded holidays or special sessions and does not invent dates from weekday logic.

### Live versus matured populations

Run provenance now states:

- live candidates: all data-complete scanner signals available at signal time;
- historical evaluation: only observations with the required completed future horizon.

Right-edge candidates therefore remain visible even when D+5/D+30 is developing. Matured win-rate, target and MAE/MFE calculations continue to require a complete horizon.

### Evidence quarantine

The historical evidence release is recorded separately and shown in the UI as quarantined. Its old counts remain available for audit, but must not be used as an approved quality policy until rebuilt.

## Remaining gaps before approval

1. Rebuild the entire five-year source from a complete, exchange-calendar-aligned dataset; the current PostgreSQL bar estate starts in January 2023 and cannot alone replace five years.
2. Recompute every rolling indicator after repair. Do not splice corrected OHLC into previously calculated RSI, Williams %R, ATR, ADX, EMA, MACD or VWAP-distance columns.
3. Resolve point-in-time symbol lineage. The generic audit found 799 overlapping near-identical sessions for LTIM and LTM. A stable instrument identifier and effective-dated display symbol are required before performance aggregation.
4. Remove current-membership survivorship bias from historical F&O-universe evaluation by using an effective-dated eligible universe.
5. Validate the SHORT model independently. Its scanner uses cash-underlying OHLC as a directional proxy; futures execution, basis, roll, expiry and transaction costs are not represented by those cash prices.
6. Refit and validate Technical Quality Factor V2 only after the repaired inputs are frozen. Use train/out-of-sample boundaries and do not tune against the August examples.
7. Implement the month-end-only model only as a separate strategy ID, run ledger and result set if product requirements still need it.
8. Give expiry-history refreshes an explicit purpose in operational inspection. They currently reuse canonical runs and are linked through `expiry_run`; consumers must select current runs by signal date rather than generic completion time.
9. Publish confirmed candidates immediately after the signal close with entry state `PENDING`. The current daemon evaluates the latest completed signal/next-session pair; this is suitable for recorded candidates but is not yet a true after-close pre-entry alert.

## Reproducible reviewed output

The updated research replay retained live right-edge signals, gated matured outcomes, and detected symbol-lineage duplication without a hard-coded alias pair.

```text
/home/novius2/NIFTY50/monthlystrat/reviewed-output/rolling_monthly_5y_20260807_20260813T094228Z
```

Result:

- 21,858 trade rows;
- 40,688 scanner occurrences;
- 22,682 incomplete symbol-session evidence rows;
- probable duplicate lineage: LTIM/LTM, detected from overlapping price history;
- release state: `BLOCKED_DATA_QUALITY_REBUILD`;
- live candidates retained without requiring future outcomes;
- matured metrics require complete horizons.

The workbook and CSVs are audit artefacts, not approved strategy-performance evidence.

## Verification

- Rolling Monthly Python tests: 10/10 passed.
- Research backtest tests: 13/13 passed.
- API route tests: 2/2 passed.
- Web tests: 18/18 passed.
- Production Playwright: 57/57 passed at 1920x1080 and 390x844.
- Production page: `/n50/strategy/rolling-monthly`.
- Browser evidence: `output/playwright/rolling-monthly-data-integrity/`.

No Paper Trading connection, live broker order, strategy-threshold change, candidate allow-list or fabricated market value was introduced.
