# OIIS 30-Minute Run History and Automatic Paper Entry

## Operating contract

- Trading environment is always `PAPER`; this workflow has no broker or live-order path.
- OIIS evaluates the active F&O universe at 09:30 and every 30 minutes through 15:00 on NSE trading days.
- `decision_as_of` is the immutable market-data cutoff. `execution_timestamp` is when calculation started. Both are `TIMESTAMPTZ` and displayed in `Asia/Kolkata`.
- A completed time slot is not recalculated merely because the policy version changes. This prevents deployment from delaying the current scheduled decision with redundant historical work.
- Each new run links to the preceding completed run for the same date and universe.

## Quality threshold

```text
quality_score = OFactor + XFactor + Data Quality
eligible when quality_score > 185
```

All three inputs must exist. A score exactly equal to 185 does not pass. Eligible candidates are sorted by score descending, opportunity rank and symbol; only the first is the automatic paper candidate for that run.

The candidate also requires a `LONG` or `SHORT` direction, positive reference price, current NSE cash token and a bar no older than ten minutes at the cutoff. Catch-up calculations older than ten minutes are recorded `STALE` and never submitted.

## Idempotency and alerts

`oiis_live.entry_claim` has a unique `(policy_id, trade_date, symbol)` constraint. The same symbol can trade on another date, but cannot create a second OIIS paper trade on the same date. Restarts and repeated requests reuse the same idempotency key. A failed transport attempt can retry its existing claim.

Successful submission uses the universal paper API. Acceptance, fills, targets, closes and critical failures use the paper service's PostgreSQL transactional outbox and signed n8n delivery. Notification availability never controls trade recording.

## Durable history and UI

Migration `035_oiis_live_run_history_auto_paper.sql` adds run-level auto-paper fields, candidate quality fields and `oiis_live.candidate_run_change`. The change table stores current/previous O, X and DQ, all deltas, total-quality delta, direction and rank movement, threshold crossing and paper selection.

- UI: `/strategy/oiis-live/history`
- API: `GET /v1/oiis-live/run-history?tradeDate=YYYY-MM-DD&limit=24`

The page refreshes every 30 seconds and shows cutoff IST, execution IST, completion, top candidate, total score, action, paper group and per-symbol changes.

## Statuses

| Status | Meaning |
| --- | --- |
| `BELOW_THRESHOLD` | No complete score is strictly above 185. |
| `INELIGIBLE` | A top score exists but a configured execution prerequisite is missing. |
| `STALE` | Historical/catch-up run; recorded without submission. |
| `DUPLICATE` | The symbol already has today's idempotent claim. |
| `SUBMITTED` | Paper API accepted the intent. |
| `FAILED` | The durable claim and error outbox retain the failure for retry and alerting. |

## Verification

```sql
SELECT run_slot, decision_as_of, execution_timestamp, auto_paper_status,
       auto_paper_eligible_symbols, auto_paper_submitted_symbols
FROM oiis_live.selection_run
WHERE trade_date = CURRENT_DATE
ORDER BY decision_as_of;

SELECT symbol, quality_score, quality_score_delta, change_kind,
       crossed_above_threshold, auto_paper_selected
FROM oiis_live.candidate_run_change
WHERE run_id = :run_id
ORDER BY quality_score DESC;
```
