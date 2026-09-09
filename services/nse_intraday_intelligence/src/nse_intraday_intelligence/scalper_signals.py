from __future__ import annotations

import json
import math
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from hashlib import sha256
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from .config import get_settings
from .db import execute, fetch_all, fetch_one
from .logging_utils import get_logger

log = get_logger(__name__)
IST = ZoneInfo("Asia/Kolkata")
RULE_VERSION = "FNO_UNDERLYING_PAIRED_BODY80_NEXT_OPEN_V5"
MIN_SIGNAL_CANDLES = 12  # EMA9 + two precursors + setup + next-open candle


@dataclass(frozen=True)
class Candle:
    end: datetime
    open: float
    high: float
    low: float
    close: float
    ema9: float | None


def _ema9(closes: list[float]) -> list[float | None]:
    values: list[float | None] = []
    ema: float | None = None
    for index, close in enumerate(closes):
        if index == 8:
            ema = sum(closes[:9]) / 9
        elif index > 8:
            ema = .2 * close + .8 * ema  # type: ignore[operator]
        values.append(ema)
    return values


def aggregate_minutes(rows: list[dict[str, Any]], session_open: datetime, interval: int, as_of: datetime) -> list[Candle]:
    buckets: dict[datetime, list[dict[str, Any]]] = {}
    for row in sorted(rows, key=lambda item: item["ts"]):
        ts = row["ts"]
        offset = int((ts - session_open).total_seconds() // 60)
        if offset < 0:
            continue
        start = session_open + timedelta(minutes=(offset // interval) * interval)
        end = start + timedelta(minutes=interval)
        if end <= as_of:
            buckets.setdefault(end, []).append(row)
    raw: list[tuple[datetime, float, float, float, float]] = []
    for end, input_rows in sorted(buckets.items()):
        if len(input_rows) != interval or len({row["ts"] for row in input_rows}) != interval:
            continue
        values = [[float(row[key]) for key in ("open", "high", "low", "close")] for row in input_rows]
        if not all(math.isfinite(value) for group in values for value in group):
            continue
        raw.append((end, values[0][0], max(group[1] for group in values), min(group[2] for group in values), values[-1][3]))
    emas = _ema9([row[4] for row in raw])
    return [Candle(*row, ema) for row, ema in zip(raw, emas)]


def _red(bar: Candle) -> bool:
    return bar.close < bar.open


def _green(bar: Candle) -> bool:
    return bar.close > bar.open


def _above_fraction(bar: Candle) -> float | None:
    if bar.ema9 is None:
        return None
    body = bar.close - bar.open
    return (bar.close - bar.ema9) / body if body > 0 and bar.open < bar.ema9 < bar.close else None


def _below_fraction(bar: Candle) -> float | None:
    if bar.ema9 is None:
        return None
    body = bar.open - bar.close
    return (bar.ema9 - bar.close) / body if body > 0 and bar.close < bar.ema9 < bar.open else None


def detect_paired_signals(underlying: list[Candle], call: list[Candle], put: list[Candle], interval: int = 5) -> list[dict[str, Any]]:
    call_by_end = {bar.end: bar for bar in call}
    put_by_end = {bar.end: bar for bar in put}
    expected = timedelta(minutes=interval)
    signals: list[dict[str, Any]] = []
    for index in range(2, len(underlying)):
        first, second, setup = underlying[index - 2:index + 1]
        if second.end - first.end != expected or setup.end - second.end != expected:
            continue
        call_fraction = _above_fraction(setup) if (
            _red(first) and _red(second) and first.ema9 is not None and second.ema9 is not None and first.close < first.ema9 and second.close < second.ema9 and _green(setup)
        ) else None
        put_fraction = _below_fraction(setup) if (
            _green(first) and _green(second) and first.ema9 is not None and second.ema9 is not None and first.close > first.ema9 and second.close > second.ema9 and _red(setup)
        ) else None
        direction = "CALL" if call_fraction is not None and call_fraction >= .80 else "PUT" if put_fraction is not None and put_fraction >= .80 else None
        if direction is None:
            continue
        option_map = call_by_end if direction == "CALL" else put_by_end
        option_group = [option_map.get(bar.end) for bar in (first, second, setup)]
        if any(bar is None for bar in option_group):
            continue
        option_first, option_second, option_setup = option_group  # type: ignore[misc]
        option_fraction = _above_fraction(option_setup)
        if not (
            _red(option_first) and _red(option_second)
            and option_first.ema9 is not None and option_second.ema9 is not None
            and option_first.close < option_first.ema9 and option_second.close < option_second.ema9
            and _green(option_setup) and option_fraction is not None and option_fraction >= .80
        ):
            continue
        next_end = setup.end + expected
        next_underlying = next((bar for bar in underlying if bar.end == next_end), None)
        next_option = option_map.get(next_end)
        if next_underlying is None or next_option is None:
            continue
        next_open_pass = next_underlying.open > setup.ema9 if direction == "CALL" else next_underlying.open < setup.ema9  # type: ignore[operator]
        if not next_open_pass:
            continue
        signals.append({
            "direction": direction,
            "setup_end": setup.end,
            "entry_end": next_end,
            "underlying_setup_close": setup.close,
            "underlying_ema9": setup.ema9,
            "underlying_fraction": call_fraction if direction == "CALL" else put_fraction,
            "option_setup_close": option_setup.close,
            "option_ema9": option_setup.ema9,
            "option_fraction": option_fraction,
            "underlying_entry_open": next_underlying.open,
            "option_entry_open": next_option.open,
        })
    return signals


def _signal_key(signal: dict[str, Any], option_token: str, interval: int) -> str:
    material = f"{RULE_VERSION}|{interval}|{option_token}|{signal['direction']}|{signal['setup_end'].isoformat()}"
    return sha256(material.encode()).hexdigest()


def render_whatsapp(signal: dict[str, Any], option_symbol: str, interval: int = 5, underlying_symbol: str = "NIFTY") -> str:
    at = signal["entry_end"].astimezone(IST).strftime("%d %b %Y · %H:%M IST")
    side = "CE" if signal["direction"] == "CALL" else "PE"
    return "\n".join([
        f"{underlying_symbol} {signal['direction']} ENTRY · {interval}m",
        f"Time: {at}",
        f"Option: {option_symbol}",
        f"Entry: ₹{signal['option_entry_open']:.2f} | {underlying_symbol} {signal['underlying_entry_open']:.2f}",
        f"Confirmed: {underlying_symbol} {signal['underlying_fraction'] * 100:.1f}% {'above' if signal['direction'] == 'CALL' else 'below'} EMA9 + {side} {signal['option_fraction'] * 100:.1f}% above EMA9",
        "Pattern: two precursor candles + paired 80% crossover",
    ])


def _send_whatsapp(signal_key: str, message: str) -> tuple[bool, int | None, str | None]:
    settings = get_settings()
    if not settings.scalper_whatsapp_enabled:
        return False, None, "DISABLED"
    token_path = Path(settings.scalper_whatsapp_token_file)
    if not settings.scalper_whatsapp_url or not settings.scalper_whatsapp_chat_id or not token_path.is_file():
        return False, None, "CONFIGURATION_INCOMPLETE"
    token = token_path.read_text(encoding="utf-8").strip()
    if not token:
        return False, None, "TOKEN_EMPTY"
    request = urllib.request.Request(
        settings.scalper_whatsapp_url,
        data=json.dumps({"chatId": settings.scalper_whatsapp_chat_id, "message": message}).encode(),
        headers={"Content-Type": "application/json; charset=utf-8", "X-API-Token": token, "Idempotency-Key": signal_key},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=settings.scalper_whatsapp_timeout_seconds) as response:
            code = int(response.status)
            return 200 <= code < 300, code, None if 200 <= code < 300 else f"HTTP_{code}"
    except urllib.error.HTTPError as exc:
        return False, exc.code, f"HTTP_{exc.code}"
    except Exception as exc:
        return False, None, type(exc).__name__


def _group_bars(rows: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        grouped.setdefault(str(row["symbol_token"]), []).append(row)
    return grouped


def _load_universe(trade_date: date) -> list[dict[str, Any]]:
    return fetch_all("""
      select distinct on (s.name) s.name symbol,s.symbol_token underlying_token,
        case when s.instrumenttype='AMXIDX' then 'OPTIDX' else 'OPTSTK' end option_type
      from public.instruments s
      where s.exchange='NSE'
        and (s.instrumenttype='AMXIDX' or s.tradingsymbol=s.name||'-EQ')
        and exists (
          select 1 from public.instruments o
          where o.exchange='NFO' and o.name=s.name
            and o.instrumenttype=case when s.instrumenttype='AMXIDX' then 'OPTIDX' else 'OPTSTK' end
            and o.expiry>=%(date)s
        )
      order by s.name,
        case when s.instrumenttype='AMXIDX' then 0 else 1 end,
        s.updated_at desc,s.symbol_token
    """, {"date": trade_date})


def _load_bars(exchange: str, tokens: list[str], start: datetime, end: datetime) -> dict[str, list[dict[str, Any]]]:
    if not tokens:
        return {}
    rows = fetch_all("""
      select distinct on(symbol_token,ts) symbol_token,ts,open,high,low,close
      from public.bars_1m
      where exchange=%(exchange)s and symbol_token=any(%(tokens)s)
        and ts>=%(start)s and ts<%(end)s
      order by symbol_token,ts,created_at desc
    """, {"exchange": exchange, "tokens": tokens, "start": start, "end": end})
    return _group_bars(rows)


def _load_option_pairs(
    universe: list[dict[str, Any]],
    underlying_rows: dict[str, list[dict[str, Any]]],
    trade_date: date,
) -> dict[str, dict[str, Any]]:
    spot_rows = []
    for item in universe:
        rows = underlying_rows.get(str(item["underlying_token"]), [])
        if rows:
            symbol = str(item["symbol"])
            spot_rows.append({
                "symbol": symbol,
                "subscription_underlying": "NIFTY50" if symbol == "NIFTY" else symbol,
                "option_type": str(item["option_type"]),
                "spot": float(rows[-1]["close"]),
            })
    if not spot_rows:
        return {}
    pairs = fetch_all("""
      with spots as (
        select * from jsonb_to_recordset(%(spots)s::jsonb)
          as x(symbol text,subscription_underlying text,option_type text,spot float8)
      ), candidates as (
        select x.symbol,c.expiry,c.strike::float8,c.symbol_token ce_token,c.tradingsymbol ce_symbol,
          p.symbol_token pe_token,p.tradingsymbol pe_symbol,
          row_number() over(partition by x.symbol order by c.expiry,abs(c.strike-x.spot),c.strike) selection_rank
        from spots x
        join public.subscriptions c on c.exchange='NFO' and c.active
          and upper(c.underlying)=upper(x.subscription_underlying) and c.kind in ('OPTIDX','OPTSTK')
          and c."right"='CE' and c.expiry>=%(date)s
        join public.subscriptions p on p.exchange='NFO' and p.active
          and upper(p.underlying)=upper(c.underlying) and p.kind=c.kind
          and p.expiry=c.expiry and p.strike=c.strike and p."right"='PE'
      )
      select symbol,expiry,strike,ce_token,ce_symbol,pe_token,pe_symbol
      from candidates where selection_rank=1
    """, {"spots": json.dumps(spot_rows), "date": trade_date})
    return {str(pair["symbol"]): pair for pair in pairs}


def _persist_signals(
    trade_date: date,
    as_of: datetime,
    interval: int,
    item: dict[str, Any],
    pair: dict[str, Any],
    signals: list[dict[str, Any]],
) -> tuple[int, int]:
    settings = get_settings()
    inserted = delivered = 0
    for signal in signals:
        option_token = str(pair["ce_token"] if signal["direction"] == "CALL" else pair["pe_token"])
        option_symbol = str(pair["ce_symbol"] if signal["direction"] == "CALL" else pair["pe_symbol"])
        key = _signal_key(signal, option_token, interval)
        recent = as_of - signal["entry_end"] <= timedelta(minutes=settings.scalper_alert_max_age_minutes)
        row = fetch_one("""
          insert into nse_ops.scalper_entry_signal(signal_key,rule_version,trade_date,interval_minutes,setup_end,entry_end,direction,
            underlying_symbol,underlying_token,option_symbol,option_token,expiry,strike,underlying_setup_close,underlying_ema9,
            underlying_body_fraction,option_setup_close,option_ema9,option_body_fraction,underlying_entry_open,option_entry_open,evidence_json,delivery_status)
          values(%(key)s,%(rule)s,%(date)s,%(interval)s,%(setup)s,%(entry)s,%(direction)s,%(underlying_symbol)s,%(underlying_token)s,%(option_symbol)s,%(option_token)s,
            %(expiry)s,%(strike)s,%(uclose)s,%(uema)s,%(ufraction)s,%(oclose)s,%(oema)s,%(ofraction)s,%(uopen)s,%(oopen)s,%(evidence)s::jsonb,%(delivery)s)
          on conflict(signal_key) do nothing returning signal_key
        """, {
            "key": key, "rule": RULE_VERSION, "date": trade_date, "interval": interval,
            "setup": signal["setup_end"], "entry": signal["entry_end"], "direction": signal["direction"],
            "underlying_symbol": item["symbol"], "underlying_token": item["underlying_token"], "option_symbol": option_symbol, "option_token": option_token,
            "expiry": pair["expiry"], "strike": pair["strike"], "uclose": signal["underlying_setup_close"], "uema": signal["underlying_ema9"],
            "ufraction": signal["underlying_fraction"], "oclose": signal["option_setup_close"], "oema": signal["option_ema9"],
            "ofraction": signal["option_fraction"], "uopen": signal["underlying_entry_open"], "oopen": signal["option_entry_open"],
            "evidence": json.dumps({key: value.isoformat() if isinstance(value, datetime) else value for key, value in signal.items()}),
            "delivery": "PENDING" if recent and settings.scalper_whatsapp_enabled else "SUPPRESSED_STALE" if not recent else "DISABLED",
        })
        if not row:
            continue
        inserted += 1
        if recent and settings.scalper_whatsapp_enabled:
            ok, status, error = _send_whatsapp(key, render_whatsapp(signal, option_symbol, interval, str(item["symbol"])))
            execute("update nse_ops.scalper_entry_signal set delivery_status=%(state)s,delivery_attempts=delivery_attempts+1,delivered_at=case when %(ok)s then now() else delivered_at end,last_http_status=%(status)s,last_error=%(error)s,updated_at=now() where signal_key=%(key)s", {"state": "DELIVERED" if ok else "FAILED", "ok": ok, "status": status, "error": error, "key": key})
            delivered += int(ok)
    return inserted, delivered


def evaluate_scalper_entries(trade_date: date | None = None, as_of: datetime | None = None) -> dict[str, Any]:
    settings = get_settings()
    as_of = as_of or datetime.now(timezone.utc)
    trade_date = trade_date or as_of.astimezone(IST).date()
    calendar = fetch_one("select market_open_ts,market_close_ts from public.trading_calendar where trade_date=%(date)s and is_trading_day", {"date": trade_date})
    if not calendar:
        return {"state": "NON_TRADING_DAY", "universe": 0, "evaluated": 0, "intervals": [], "inserted": 0, "delivered": 0}
    session_open = calendar["market_open_ts"]
    evaluation_end = min(as_of, calendar["market_close_ts"])
    universe = _load_universe(trade_date)
    underlying_rows = _load_bars("NSE", [str(item["underlying_token"]) for item in universe], session_open, evaluation_end)
    pairs = _load_option_pairs(universe, underlying_rows, trade_date)
    option_tokens = sorted({str(pair[key]) for pair in pairs.values() for key in ("ce_token", "pe_token")})
    option_rows = _load_bars("NFO", option_tokens, session_open, evaluation_end)
    observed_pairs = sum(
        1 for pair in pairs.values()
        if str(pair["ce_token"]) in option_rows and str(pair["pe_token"]) in option_rows
    )
    results: list[dict[str, Any]] = []
    evaluated_symbols: set[str] = set()
    for interval in settings.scalper_intervals:
        signals_count = inserted = delivered = evaluated = 0
        insufficient_bars = missing_pair = 0
        for item in universe:
            symbol = str(item["symbol"])
            pair = pairs.get(symbol)
            underlying = aggregate_minutes(underlying_rows.get(str(item["underlying_token"]), []), session_open, interval, evaluation_end)
            if len(underlying) < MIN_SIGNAL_CANDLES:
                insufficient_bars += 1
                continue
            if pair is None:
                missing_pair += 1
                continue
            call = aggregate_minutes(option_rows.get(str(pair["ce_token"]), []), session_open, interval, evaluation_end)
            put = aggregate_minutes(option_rows.get(str(pair["pe_token"]), []), session_open, interval, evaluation_end)
            if len(call) < MIN_SIGNAL_CANDLES or len(put) < MIN_SIGNAL_CANDLES:
                insufficient_bars += 1
                continue
            evaluated += 1
            evaluated_symbols.add(symbol)
            signals = detect_paired_signals(underlying, call, put, interval)
            signals_count += len(signals)
            new_rows, sent_rows = _persist_signals(trade_date, as_of, interval, item, pair, signals)
            inserted += new_rows
            delivered += sent_rows
        state = "COMPLETE" if evaluated else "DATA_INSUFFICIENT"
        result = {
            "interval": interval, "state": state, "evaluated": evaluated,
            "signals": signals_count, "inserted": inserted, "delivered": delivered,
            "insufficient_bars": insufficient_bars, "missing_pair": missing_pair,
        }
        results.append(result)
        log.info(
            "scalper universe evaluation interval=%sm state=%s universe=%s evaluated=%s insufficient_bars=%s missing_pair=%s signals=%s inserted=%s delivered=%s",
            interval, state, len(universe), evaluated, insufficient_bars, missing_pair, signals_count, inserted, delivered,
        )
    return {
        "state": "COMPLETE" if any(result["state"] == "COMPLETE" for result in results) else "DATA_INSUFFICIENT",
        "universe": len(universe),
        "evaluated": len(evaluated_symbols),
        "underlying_data": sum(1 for item in universe if str(item["underlying_token"]) in underlying_rows),
        "configured_pairs": len(pairs),
        "paired_option_data": observed_pairs,
        "intervals": results,
        "inserted": sum(int(result.get("inserted", 0)) for result in results),
        "delivered": sum(int(result.get("delivered", 0)) for result in results),
    }
