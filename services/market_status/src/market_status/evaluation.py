from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Any

from .models import decimal_text, directional_memberships, fingerprint_membership


class EvaluationError(ValueError):
    def __init__(self, reason: str, detail: dict[str, Any] | None = None) -> None:
        super().__init__(reason)
        self.reason = reason
        self.detail = detail or {}


def exact(value: Any) -> Decimal:
    if value is None:
        raise EvaluationError("OIIS_SCORE_NOT_ESTIMABLE")
    try:
        result = Decimal(str(value))
    except (InvalidOperation, ValueError) as exc:
        raise EvaluationError("OIIS_SCORE_NOT_ESTIMABLE") from exc
    if not result.is_finite():
        raise EvaluationError("OIIS_SCORE_NOT_ESTIMABLE")
    return result


def index_snapshot(row: dict[str, Any]) -> dict[str, str]:
    current = exact(row["ltp"])
    previous = exact(row["close"])
    session_open = exact(row["open"])
    if current <= 0 or previous <= 0 or session_open <= 0:
        raise EvaluationError("PREVIOUS_CLOSE_INVALID")
    point_change = current - previous
    gap_points = session_open - previous
    move_from_open = current - session_open
    return {
        "index_symbol": "NIFTY50",
        "index_name": "NIFTY 50",
        "current_level": decimal_text(current),
        "previous_close": decimal_text(previous),
        "point_change": decimal_text(point_change),
        "percentage_change": decimal_text(point_change * 100 / previous),
        "session_open": decimal_text(session_open),
        "gap_points": decimal_text(gap_points),
        "gap_percentage": decimal_text(gap_points * 100 / previous),
        "move_from_open_points": decimal_text(move_from_open),
        "move_from_open_percentage": decimal_text(move_from_open * 100 / session_open),
        "session_high": decimal_text(exact(row["high"])),
        "session_low": decimal_text(exact(row["low"])),
    }


def close_snapshot(row: dict[str, Any]) -> dict[str, str]:
    final_close = exact(row["ltp"])
    previous = exact(row["close"])
    session_open = exact(row["open"])
    high = exact(row["high"])
    low = exact(row["low"])
    if min(final_close, previous, session_open, high, low) <= 0:
        raise EvaluationError("PREVIOUS_CLOSE_INVALID")
    daily = final_close - previous
    open_close = final_close - session_open
    day_range = high - low
    return {
        "index_symbol": "NIFTY50",
        "final_close": decimal_text(final_close),
        "previous_close": decimal_text(previous),
        "daily_delta_points": decimal_text(daily),
        "daily_delta_percentage": decimal_text(daily * 100 / previous),
        "session_open": decimal_text(session_open),
        "open_to_close_points": decimal_text(open_close),
        "open_to_close_percentage": decimal_text(open_close * 100 / session_open),
        "session_high": decimal_text(high),
        "session_low": decimal_text(low),
        "range_points": decimal_text(day_range),
        "range_percentage": decimal_text(day_range * 100 / previous),
        "finalisation_status": "FINAL",
    }


def rank_movers(rows: list[dict[str, Any]], count: int) -> tuple[list[dict[str, str | int]], list[dict[str, str | int]]]:
    calculated: list[dict[str, Any]] = []
    symbols: set[str] = set()
    tokens: set[str] = set()
    for row in rows:
        symbol = str(row["symbol"]).upper()
        token = str(row["symbol_token"])
        if symbol in symbols or token in tokens:
            raise EvaluationError("NIFTY50_UNIVERSE_INCOMPLETE", {"duplicate": symbol})
        symbols.add(symbol)
        tokens.add(token)
        current = exact(row["ltp"])
        previous = exact(row["close"])
        if current <= 0 or previous <= 0:
            raise EvaluationError("PREVIOUS_CLOSE_INVALID", {"symbol": symbol})
        calculated.append(
            {
                "symbol": symbol,
                "display_name": row.get("display_name") or symbol,
                "current_price": current,
                "previous_close": previous,
                "change_points": current - previous,
                "change_percentage": (current - previous) * 100 / previous,
                "quote_time": row["ts"],
            }
        )
    gainers = sorted(calculated, key=lambda item: (-item["change_percentage"], item["symbol"]))[:count]
    losers = sorted(calculated, key=lambda item: (item["change_percentage"], item["symbol"]))[:count]

    def serialise(items: list[dict[str, Any]]) -> list[dict[str, str | int]]:
        return [
            {
                "rank": rank,
                "symbol": item["symbol"],
                "display_name": item["display_name"],
                "current_price": decimal_text(item["current_price"]),
                "previous_close": decimal_text(item["previous_close"]),
                "change_points": decimal_text(item["change_points"]),
                "change_percentage": decimal_text(item["change_percentage"]),
                "quote_time": item["quote_time"].isoformat(),
            }
            for rank, item in enumerate(items, 1)
        ]

    return serialise(gainers), serialise(losers)


def oiis_candidates(
    rows: list[dict[str, Any]], x_min: Decimal, o_min: Decimal, per_direction: int
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, list[str]], str]:
    seen: dict[str, str] = {}
    eligible: list[dict[str, Any]] = []
    for row in rows:
        symbol = str(row.get("symbol") or "").upper()
        direction = str(row.get("direction") or "").upper()
        if not symbol or direction not in {"LONG", "SHORT"}:
            continue
        if symbol in seen:
            reason = "OIIS_DIRECTION_CONFLICT" if seen[symbol] != direction else "OIIS_DUPLICATE_SYMBOL"
            raise EvaluationError(reason, {"symbol": symbol})
        seen[symbol] = direction
        flags = row.get("universe_flags") or {}
        evidence = row.get("evidence") or {}
        reasons = [str(value).upper() for value in (row.get("reason_codes") or [])]
        if flags.get("fixture") or flags.get("test_override") or evidence.get("fixture"):
            continue
        if str(row.get("data_permission") or "").upper() not in {"FULL", "VALID"}:
            continue
        if any("DATA_UNAVAILABLE" in reason or "NOT_ESTIMABLE" in reason for reason in reasons):
            continue
        try:
            xfactor = exact(row.get("xfactor_snapshot"))
            ofactor = exact(row.get("ofactor"))
        except EvaluationError:
            continue
        if not (xfactor > x_min and ofactor > o_min):
            continue
        canonical_rank = row.get("opportunity_rank")
        edge = exact(row.get("directional_edge") or 0)
        eligible.append(
            {
                **row,
                "symbol": symbol,
                "direction": direction,
                "xfactor": xfactor,
                "ofactor_value": ofactor,
                "edge": edge,
                "canonical_rank": int(canonical_rank) if canonical_rank is not None else None,
            }
        )

    def sort_key(item: dict[str, Any]) -> tuple[Any, ...]:
        if item["canonical_rank"] is not None:
            return (0, item["canonical_rank"], item["symbol"])
        minimum = min(item["xfactor"], item["ofactor_value"])
        average = (item["xfactor"] + item["ofactor_value"]) / 2
        return (1, -minimum, -average, -item["edge"], item["symbol"])

    def choose(direction: str) -> list[dict[str, Any]]:
        chosen = sorted((item for item in eligible if item["direction"] == direction), key=sort_key)[:per_direction]
        return [
            {
                "rank": rank,
                "symbol": item["symbol"],
                "direction": direction,
                "xfactor": decimal_text(item["xfactor"]),
                "ofactor": decimal_text(item["ofactor_value"]),
                **({"current_price": decimal_text(item["reference_price"])} if item.get("reference_price") else {}),
                **({"status": item["canonical_status"]} if item.get("canonical_status") else {}),
            }
            for rank, item in enumerate(chosen, 1)
        ]

    longs = choose("LONG")
    shorts = choose("SHORT")
    membership = {
        "long": sorted(item["symbol"] for item in longs),
        "short": sorted(item["symbol"] for item in shorts),
    }
    return longs, shorts, membership, fingerprint_membership(membership)


def membership_delta(
    previous: dict[str, list[str]] | None, current: dict[str, list[str]]
) -> tuple[list[str], list[str]]:
    old = directional_memberships(previous or {"long": [], "short": []})
    new = directional_memberships(current)
    return sorted(new - old), sorted(old - new)
