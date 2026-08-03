# Data contract

The package uses compatibility views so the application can adapt existing tables without invasive code changes.

## 1) `integration.v_source_security_1m`

Required columns:

| Column | Type | Notes |
|---|---|---|
| `minute_ts` | `timestamptz` | One row per symbol per minute |
| `trade_date` | `date` | Session date |
| `symbol` | `text` | NSE symbol |
| `open_px` | `numeric` | Minute open |
| `high_px` | `numeric` | Minute high |
| `low_px` | `numeric` | Minute low |
| `close_px` | `numeric` | Minute close |
| `volume` | `bigint` | Minute volume |
| `turnover` | `numeric` | Nullable |
| `vwap` | `numeric` | Nullable but recommended |
| `trades` | `integer` | Nullable |
| `source_pk` | `text` | Optional unique source-row id |
| `source_system` | `text` | Optional feed name |

## 2) `integration.v_source_index_1m`

Required columns:

| Column | Type | Notes |
|---|---|---|
| `minute_ts` | `timestamptz` | One row per minute per index |
| `trade_date` | `date` | Session date |
| `index_code` | `text` | For example `NIFTY 50` |
| `index_name` | `text` | Display title |
| `open_px` | `numeric` | Minute open |
| `high_px` | `numeric` | Minute high |
| `low_px` | `numeric` | Minute low |
| `close_px` | `numeric` | Minute close |
| `volume` | `bigint` | Nullable |
| `turnover` | `numeric` | Nullable |
| `vwap` | `numeric` | Nullable |
| `trades` | `integer` | Nullable |
| `source_pk` | `text` | Optional unique source-row id |
| `source_system` | `text` | Optional feed name |

## 3) `integration.v_prev_security_daily`

This view must expose the **current trade date** while carrying prior-session reference data for that same session.

Example:
- if the current intraday session is `2026-03-06`
- `trade_date` should be `2026-03-06`
- `prev_close` should be the close from `2026-03-05`

Required columns:

| Column | Type | Notes |
|---|---|---|
| `trade_date` | `date` | Current session date |
| `symbol` | `text` | NSE symbol |
| `prev_close` | `numeric` | Prior close |
| `avg_daily_volume_20d` | `bigint` | Optional but recommended |
| `sector_name` | `text` | Optional but recommended |
| `universe_weight` | `numeric` | Optional but recommended |
| `market_cap` | `numeric` | Optional |

## 4) `integration.v_prev_index_daily`

| Column | Type | Notes |
|---|---|---|
| `trade_date` | `date` | Current session date |
| `index_code` | `text` | Index identifier |
| `prev_close` | `numeric` | Prior close |

## 5) `integration.v_universe_membership`

This is how the package knows which stocks belong to the large-cap basket and, optionally, their weights.

| Column | Type | Notes |
|---|---|---|
| `universe_name` | `text` | Usually `NIFTY100` |
| `symbol` | `text` | NSE symbol |
| `weight` | `numeric` | Optional but strongly recommended |
| `sector_name` | `text` | Optional but useful for UI |
| `effective_from` | `date` | Membership start |
| `effective_to` | `date` | Nullable |
| `source_system` | `text` | Optional |

## 6) `integration.v_index_daily_history`

This is optional but highly valuable. It lets the package compute historical state follow-through.

| Column | Type | Notes |
|---|---|---|
| `trade_date` | `date` | Daily date |
| `index_code` | `text` | Same code used in minute index view |
| `close_px` | `numeric` | Daily close |

## Example compatibility view pattern

```sql
create or replace view integration.v_source_security_1m as
select
  bar_ts as minute_ts,
  trade_date,
  symbol,
  open as open_px,
  high as high_px,
  low as low_px,
  close as close_px,
  volume,
  turnover,
  vwap,
  trades,
  concat(symbol, ':', bar_ts::text) as source_pk,
  'app_capture'::text as source_system
from app_capture.security_1m_bars;
```

## Notes for the coding agent

- Prefer creating views over changing base-table ownership.
- Keep timestamps aligned to a single timezone contract.
- If the source feed is sparse, preserve missing rows as missing rows. Do not fill with zeros.
- If the index feed supports multiple indices, keep all of them available; the API can choose one through `index_code`.
