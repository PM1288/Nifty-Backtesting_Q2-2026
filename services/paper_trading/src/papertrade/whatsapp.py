from __future__ import annotations

import base64
import io
import math
import re
from dataclasses import dataclass
from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Any
from zoneinfo import ZoneInfo

from PIL import Image, ImageDraw, ImageFont

IST = ZoneInfo("Asia/Kolkata")
CONTROL = re.compile(r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]")


@dataclass(frozen=True)
class DeliveryDecision:
    send: bool
    kind: str
    reason: str


def _data(event: dict[str, Any]) -> dict[str, Any]:
    value = event.get("data")
    return value if isinstance(value, dict) else {}


def _number(value: Any) -> Decimal | None:
    if value in (None, ""):
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None


def _clean(value: Any, limit: int = 180) -> str:
    text = CONTROL.sub(" ", str(value or ""))
    return text.replace("\r", " ").replace("\n", " ").replace("`", "'").strip()[:limit]


def _money(value: Any, signed: bool = False) -> str:
    amount = _number(value)
    if amount is None:
        return "—"
    amount = amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    sign = "-" if amount < 0 else "+" if signed and amount > 0 else ""
    whole, fraction = f"{abs(amount):.2f}".split(".")
    if len(whole) > 3:
        prefix, tail = whole[:-3], whole[-3:]
        groups: list[str] = []
        while prefix:
            groups.insert(0, prefix[-2:])
            prefix = prefix[:-2]
        whole = ",".join([*groups, tail])
    return f"{sign}₹{whole}.{fraction}"


def _pct(value: Any, ratio: bool = False) -> str:
    amount = _number(value)
    if amount is None:
        return "—"
    if ratio:
        amount *= 100
    amount = amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return f"{'+' if amount > 0 else ''}{amount:.2f}%"


def _qty(value: Any) -> str:
    amount = _number(value)
    if amount is None:
        return "—"
    return f"{amount:,.8f}".rstrip("0").rstrip(".")


def _metric(value: Any) -> str:
    amount = _number(value)
    return "—" if amount is None else f"{amount.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP):.2f}"


def _when(value: Any) -> str:
    if not value:
        return "time unavailable"
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00")).astimezone(IST)
    except (TypeError, ValueError):
        return "time unavailable"
    return parsed.strftime("%d %b %Y · %H:%M:%S IST")


def _parsed_time(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None


def _target_lifecycle(target: dict[str, Any], data: dict[str, Any]) -> str:
    explicit = _clean(target.get("lifecycle") or data.get("lifecycle"), 16).upper()
    target_id = _clean(target.get("target_id") or target.get("target_code") or "", 40).upper()
    return explicit or ("SWING" if target_id.startswith("SWING") else "INTRADAY")


def _time_to_target(target: dict[str, Any], data: dict[str, Any], event_time: Any) -> str:
    opened = _parsed_time(data.get("opened_at") or data.get("fill_time"))
    hit = _parsed_time(target.get("hit_at") or data.get("hit_at") or event_time)
    if opened is None or hit is None or hit < opened:
        return "—"
    elapsed_seconds = int((hit - opened).total_seconds())
    if _target_lifecycle(target, data) == "SWING":
        days = int(
            (Decimal(elapsed_seconds) / Decimal(86400)).quantize(
                Decimal("1"), rounding=ROUND_HALF_UP
            )
        )
        return f"{days} {'day' if days == 1 else 'days'}"
    minutes = elapsed_seconds // 60
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def _target_profit(
    target: dict[str, Any], data: dict[str, Any], side: str, quantity: Any
) -> tuple[Decimal | None, Decimal | None]:
    entry = _number(data.get("entry_price") or data.get("fill_price"))
    target_price = _number(target.get("target_price") or data.get("target_price"))
    units = _number(quantity)
    if entry is None or target_price is None:
        return None, None
    per_share = entry - target_price if side == "SHORT" else target_price - entry
    return per_share, per_share * units if units is not None else None


def classify(event: dict[str, Any], settings: Any) -> DeliveryDecision:
    event_type = str(event.get("type") or "").lower()
    data = _data(event)
    if "trade_leg.opened" in event_type or "position.opened" in event_type:
        return DeliveryDecision(True, "ENTRY", "ENTRY_FILLED")
    if "target_track.closed" in event_type or "target.reached" in event_type:
        return DeliveryDecision(True, "TARGET", "TARGET_REACHED")
    if "trade_group.partially_closed" in event_type:
        return DeliveryDecision(True, "PARTIAL_EXIT", "POSITION_REDUCED")
    if "trade_group.closed" in event_type:
        return DeliveryDecision(True, "EXIT", "POSITION_CLOSED")
    if "trade_intent.rejected" in event_type:
        return DeliveryDecision(True, "REJECTED", "ORDER_REJECTED")
    if ".summary.daily" in event_type:
        return DeliveryDecision(True, "DAILY_SUMMARY", "DAILY_DIGEST")
    if ".summary.weekly" in event_type:
        return DeliveryDecision(True, "WEEKLY_SUMMARY", "WEEKLY_DIGEST")
    if "system.processing_error" in event_type or "webhook.dead_lettered" in event_type:
        severity = str(data.get("severity") or event.get("severity") or "").upper()
        return DeliveryDecision(severity == "CRITICAL", "SYSTEM_ERROR", "CRITICAL_ONLY")
    if "market_data.stale" in event_type:
        affected = int(_number(data.get("affected_count")) or 1)
        duration = int(_number(data.get("duration_seconds") or data.get("stale_for_seconds")) or 0)
        critical = str(data.get("severity") or event.get("severity") or "").upper() == "CRITICAL"
        allowed = (
            critical
            or affected >= settings.WA_DATA_ALERT_MIN_AFFECTED
            or duration >= settings.WA_DATA_ALERT_MIN_DURATION_SECONDS
        )
        return DeliveryDecision(
            allowed, "DATA_STALE", "SUSTAINED_OUTAGE" if allowed else "TRANSIENT_DATA_FLAP"
        )
    # These events remain durable in PostgreSQL but are not chat interruptions.
    return DeliveryDecision(False, "SUPPRESSED", "LOW_NOISE_POLICY")


def _rows_table(rows: list[tuple[str, str]]) -> str:
    rows = [(label, value) for label, value in rows if value != "—"][:12]
    width = min(16, max((len(label) for label, _ in rows), default=0))
    return "```\n" + "\n".join(f"{label:<{width}}  {value}" for label, value in rows) + "\n```"


def _entry_book_lines(book: Any) -> list[str]:
    """Render the immutable entry-time SmartAPI touch and top-three ladder."""
    if not isinstance(book, dict) or book.get("availability_status") not in {
        "CAPTURED",
        "PARTIAL_DEPTH",
        "NO_TWO_SIDED_BOOK",
    }:
        return []
    bids = book.get("bid_levels") if isinstance(book.get("bid_levels"), list) else []
    asks = book.get("ask_levels") if isinstance(book.get("ask_levels"), list) else []
    best_bid = _number(book.get("best_bid_price"))
    best_ask = _number(book.get("best_ask_price"))
    spread = best_ask - best_bid if best_bid is not None and best_ask is not None else None
    midpoint = (best_ask + best_bid) / 2 if best_bid is not None and best_ask is not None else None
    spread_pct = spread * 100 / midpoint if spread is not None and midpoint else None
    age_ms = _number(book.get("quote_age_ms"))
    lines = ["", "*MARKET BOOK AT ENTRY*"]
    metrics = [
        ("LTP", _money(book.get("ltp"))),
        ("Last trade qty", _qty(book.get("last_trade_qty"))),
        ("Day volume", _qty(book.get("cumulative_volume"))),
        ("Total buy qty", _qty(book.get("total_buy_qty"))),
        ("Total sell qty", _qty(book.get("total_sell_qty"))),
        ("Best bid", f"{_money(book.get('best_bid_price'))} × {_qty(book.get('best_bid_qty'))}"),
        ("Best ask", f"{_money(book.get('best_ask_price'))} × {_qty(book.get('best_ask_qty'))}"),
        ("Spread", f"{_money(spread)} ({_pct(spread_pct)})" if spread is not None else "—"),
    ]
    lines.append(_rows_table(metrics))
    if bids or asks:
        lines.append("*TOP 3 BID / ASK*  _(price × qty · orders)_")
        ladder: list[str] = []
        for index in range(3):
            bid = bids[index] if index < len(bids) and isinstance(bids[index], dict) else {}
            ask = asks[index] if index < len(asks) and isinstance(asks[index], dict) else {}
            ladder.append(
                f"L{index + 1}  "
                f"BID {_money(bid.get('price'))} × {_qty(bid.get('quantity'))} · {_qty(bid.get('orders'))}  |  "
                f"ASK {_money(ask.get('price'))} × {_qty(ask.get('quantity'))} · {_qty(ask.get('orders'))}"
            )
        lines.append("```\n" + "\n".join(ladder) + "\n```")
    context = [f"Book {_when(book.get('quote_ts'))}"]
    if age_ms is not None:
        context.append(f"age {(age_ms / Decimal('1000')).quantize(Decimal('0.01'))} s")
    lines.append(" · ".join(context))
    return lines


def render_message(
    event: dict[str, Any], decision: DeliveryDecision, factors: dict[str, Any] | None = None
) -> str:
    data = _data(event)
    factors = factors or {}
    symbol = _clean(data.get("symbol") or "PAPER PORTFOLIO", 40).upper()
    raw_side = _clean(data.get("side") or "PAPER", 12).upper()
    side = "LONG" if raw_side in {"BUY", "LONG"} else "SHORT" if raw_side in {"SELL", "SHORT"} else raw_side
    trade_ref = _clean(data.get("client_group_id") or event.get("subject") or event.get("id"), 48)
    strategy = _clean(data.get("strategy_name") or data.get("strategy_id") or "", 64)
    entry = data.get("fill_price") or data.get("entry_price")
    quantity = data.get("fill_quantity") or data.get("quantity") or data.get("closed_quantity")
    icon_title = {
        "ENTRY": ("🟢", "PAPER ENTRY"),
        "TARGET": ("✅", "PAPER TARGET HIT"),
        "PARTIAL_EXIT": ("🏁", "PAPER PARTIAL EXIT"),
        "EXIT": ("🏁", "PAPER EXIT"),
        "REJECTED": ("⛔", "PAPER REJECTED"),
        "DATA_STALE": ("⚠️", "PAPER DATA STALE"),
        "SYSTEM_ERROR": ("🚨", "PAPER SYSTEM ERROR"),
        "DAILY_SUMMARY": ("📊", "PAPER DAILY SUMMARY"),
        "WEEKLY_SUMMARY": ("📊", "PAPER WEEKLY SUMMARY"),
    }.get(decision.kind, ("🔵", "PAPER UPDATE"))
    company_name = _clean(factors.get("company_name") or symbol, 72)
    identity = f"{company_name} ({symbol})" if company_name.upper() != symbol else symbol
    lines = [
        f"{icon_title[0]} *{icon_title[1]}* · `{side}`",
        f"*{identity}* · NSE",
        f"Trade `{trade_ref}`",
    ]
    rows: list[tuple[str, str]] = []
    reason = data.get("reason") or data.get("detail")
    if decision.kind == "ENTRY":
        active: dict[str, Any] = (
            data["active_exit_target"] if isinstance(data.get("active_exit_target"), dict) else {}
        )
        swing: dict[str, Any] = (
            data["swing_exit_target"] if isinstance(data.get("swing_exit_target"), dict) else {}
        )
        rows = [
            ("Entry", _money(entry)),
            ("Quantity", _qty(quantity)),
            ("Intraday", _money(active.get("target_price"))),
            ("Swing", _money(swing.get("target_price"))),
            ("O factor", _metric(factors.get("ofactor"))),
            ("X factor", _metric(factors.get("xfactor"))),
            ("RSI 14", _metric(factors.get("rsi14"))),
            ("52W high", _money(factors.get("week52_high"))),
            ("52W low", _money(factors.get("week52_low"))),
            ("52W position", _pct(factors.get("week52_position_pct"))),
        ]
        reason = None
    elif decision.kind == "TARGET":
        tracks = (
            data.get("newly_closed_target_tracks")
            if isinstance(data.get("newly_closed_target_tracks"), list)
            else []
        )
        target = tracks[0] if tracks and isinstance(tracks[0], dict) else {}
        lifecycle = _target_lifecycle(target, data)
        profit_per_share, gross_profit = _target_profit(target, data, side, quantity)
        rows = [
            ("Target type", lifecycle.title()),
            ("Entry", _money(data.get("entry_price"))),
            ("Target", _money(target.get("target_price") or data.get("target_price"))),
            ("Observed", _money(target.get("observed_price") or data.get("current_price"))),
            ("Target move", _pct(target.get("target_pct") or data.get("target_pct"), ratio=True)),
            ("Time to hit", _time_to_target(target, data, event.get("time"))),
            ("Profit/share", _money(profit_per_share, signed=True)),
            ("Gross profit", _money(gross_profit, signed=True)),
            ("52W high", _money(factors.get("week52_high"))),
            ("52W low", _money(factors.get("week52_low"))),
            ("52W position", _pct(factors.get("week52_position_pct"))),
        ]
        reason = "Analytical target reached. Execution position status remains separately governed."
    elif decision.kind in {"EXIT", "PARTIAL_EXIT"}:
        rows = [
            ("Entry", _money(entry)),
            ("Exit", _money(data.get("fill_price") or data.get("exit_price"))),
            ("Quantity", _qty(quantity)),
            ("Gross P&L", _money(data.get("gross_realised_pnl"), signed=True)),
            ("Costs", _money(data.get("trading_costs"))),
            ("Net P&L", _money(data.get("net_after_tax"), signed=True)),
            ("52W high", _money(factors.get("week52_high"))),
            ("52W low", _money(factors.get("week52_low"))),
            ("52W position", _pct(factors.get("week52_position_pct"))),
        ]
        reason = data.get("exit_reason_code") or "Governed paper exit completed."
    elif decision.kind in {"DAILY_SUMMARY", "WEEKLY_SUMMARY"}:
        summary: dict[str, Any] = data["summary"] if isinstance(data.get("summary"), dict) else data
        rows = [
            ("Open trades", _qty(summary.get("groups_open_current"))),
            ("Opened today", _qty(summary.get("groups_opened"))),
            ("Closed today", _qty(summary.get("groups_closed"))),
            ("Intraday hit", _qty(summary.get("intraday_trades_hit"))),
            ("Intraday missed", _qty(summary.get("intraday_trades_missed"))),
            ("Swing hit", _qty(summary.get("swing_trades_hit"))),
            ("Swing open", _qty(summary.get("swing_trades_open"))),
            ("Targets hit", _qty(summary.get("analytical_targets_hit"))),
            ("Net realised", _money(summary.get("net_realised_pnl"), signed=True)),
        ]
    else:
        rows = [
            ("Status", decision.kind),
            ("Affected", _qty(data.get("affected_count"))),
            ("Duration", f"{int(_number(data.get('duration_seconds')) or 0) // 60} min"),
        ]
    if rows:
        lines.extend(["", _rows_table(rows)])
    if decision.kind == "ENTRY":
        lines.extend(_entry_book_lines(factors.get("entry_market_book")))
        recommendations = factors.get("trendlyne_buy_recommendations")
        lines.extend(["", "*Trendlyne · previous 30 days*"])
        if isinstance(recommendations, list) and recommendations:
            for item in recommendations[:3]:
                if not isinstance(item, dict):
                    continue
                house = _clean(item.get("house") or "Research house", 48)
                date_value = _clean(item.get("report_date") or "date unavailable", 16)
                target_text = _money(item.get("target_price"))
                lines.append(f"- *BUY* · {house} · {date_value} · target {target_text}")
        else:
            lines.append("- No BUY suggestions found for this stock in the previous 30 days.")
    if reason:
        lines.extend(["", f"> {_clean(reason, 240)}"])
    if strategy and decision.kind != "ENTRY":
        lines.extend(["", f"Strategy `{strategy}`"])
    lines.append(f"`{_when(event.get('time'))}`")
    return "\n".join(lines)


def _rsi(closes: list[float], period: int = 14) -> list[float | None]:
    result: list[float | None] = [None] * len(closes)
    if len(closes) <= period:
        return result
    gains, losses = [], []
    for index in range(1, len(closes)):
        delta = closes[index] - closes[index - 1]
        gains.append(max(delta, 0.0))
        losses.append(max(-delta, 0.0))
        if index < period:
            continue
        avg_gain = sum(gains[index - period : index]) / period
        avg_loss = sum(losses[index - period : index]) / period
        result[index] = 100.0 if avg_loss == 0 else 100.0 - 100.0 / (1.0 + avg_gain / avg_loss)
    return result


def _ema(values: list[float], period: int) -> list[float | None]:
    result: list[float | None] = [None] * len(values)
    if len(values) < period:
        return result
    current = sum(values[:period]) / period
    result[period - 1] = current
    multiplier = 2 / (period + 1)
    for index in range(period, len(values)):
        current = (values[index] - current) * multiplier + current
        result[index] = current
    return result


def _bollinger(
    closes: list[float], period: int = 20
) -> tuple[list[float | None], list[float | None], list[float | None]]:
    middle: list[float | None] = [None] * len(closes)
    upper: list[float | None] = [None] * len(closes)
    lower: list[float | None] = [None] * len(closes)
    for index in range(period - 1, len(closes)):
        window = closes[index - period + 1 : index + 1]
        average = sum(window) / period
        deviation = math.sqrt(sum((value - average) ** 2 for value in window) / period)
        middle[index] = average
        upper[index] = average + 2 * deviation
        lower[index] = average - 2 * deviation
    return middle, upper, lower


def _macd(
    closes: list[float],
) -> tuple[list[float | None], list[float | None], list[float | None]]:
    fast = _ema(closes, 12)
    slow = _ema(closes, 26)
    line: list[float | None] = [
        fast_value - slow_value if fast_value is not None and slow_value is not None else None
        for fast_value, slow_value in zip(fast, slow, strict=True)
    ]
    available = [value for value in line if value is not None]
    signal_available = _ema(available, 9)
    signal: list[float | None] = [None] * len(closes)
    cursor = 0
    for index, value in enumerate(line):
        if value is not None:
            signal[index] = signal_available[cursor]
            cursor += 1
    histogram = [
        value - signal_value if value is not None and signal_value is not None else None
        for value, signal_value in zip(line, signal, strict=True)
    ]
    return line, signal, histogram


def _line_points(
    values: list[float | None], left: float, step: float, transform: Any
) -> list[tuple[float, float]]:
    return [
        (left + 18 + step * (index + 0.5), transform(value))
        for index, value in enumerate(values)
        if value is not None
    ]


def render_entry_chart(
    bars: list[dict[str, Any]], entry_price: Any, symbol: str, factors: dict[str, Any]
) -> bytes | None:
    if len(bars) < 3:
        return None
    width, height = 1080, 1350
    image = Image.new("RGB", (width, height), "#0B1220")
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default(size=24)
    small = ImageFont.load_default(size=18)
    company = _clean(factors.get("company_name") or symbol, 54)
    identity = (
        f"{company} ({_clean(symbol, 20).upper()})" if company.upper() != symbol.upper() else symbol.upper()
    )
    draw.text((58, 30), f"{identity} · PAPER ENTRY", fill="#F8FAFC", font=font)
    draw.text(
        (58, 69),
        f"O {_metric(factors.get('ofactor'))}   X {_metric(factors.get('xfactor'))}   RSI {_metric(factors.get('rsi14'))}   52W {_metric(factors.get('week52_position_pct'))}%",
        fill="#94A3B8",
        font=small,
    )
    chart = (70, 125, 1010, 650)
    volume_box = (70, 680, 1010, 820)
    rsi_box = (70, 850, 1010, 1030)
    macd_box = (70, 1060, 1010, 1270)
    for box in (chart, volume_box, rsi_box, macd_box):
        draw.rounded_rectangle(box, radius=14, fill="#111827", outline="#334155", width=2)
    highs = [float(row["high"]) for row in bars]
    lows = [float(row["low"]) for row in bars]
    closes = [float(row["close"]) for row in bars]
    volumes = [float(row.get("volume") or 0) for row in bars]
    middle, upper, lower = _bollinger(closes)
    price_min, price_max = min(lows), max(highs)
    band_values = [value for series in (upper, lower) for value in series if value is not None]
    if band_values:
        price_min = min(price_min, min(band_values))
        price_max = max(price_max, max(band_values))
    span = max(price_max - price_min, 1e-9)
    left, top, right, bottom = chart
    step = (right - left - 30) / len(bars)
    candle_width = max(2, min(11, int(step * 0.62)))

    def py(value: float) -> float:
        return bottom - 25 - (value - price_min) / span * (bottom - top - 50)

    entry = float(entry_price) if _number(entry_price) is not None else closes[-1]
    entry_y = py(entry)
    draw.line((left + 8, entry_y, right - 8, entry_y), fill="#38BDF8", width=3)
    draw.text((right - 245, max(top + 8, entry_y - 30)), f"ENTRY {_money(entry)}", fill="#38BDF8", font=small)

    def reference_line(value: Any, label: str, colour: str) -> None:
        numeric = _number(value)
        if numeric is None:
            return
        raw = float(numeric)
        clipped = min(max(raw, price_min), price_max)
        y_value = py(clipped)
        for start in range(int(left + 8), int(right - 8), 18):
            draw.line((start, y_value, min(start + 9, right - 8), y_value), fill=colour, width=2)
        suffix = " ↑" if raw > price_max else " ↓" if raw < price_min else ""
        draw.text(
            (left + 14, max(top + 5, min(bottom - 28, y_value - 24))),
            f"{label} {_money(raw)}{suffix}",
            fill=colour,
            font=small,
        )

    reference_line(factors.get("week52_high"), "52W HIGH", "#22C55E")
    reference_line(factors.get("week52_low"), "52W LOW", "#EF4444")
    for index, row in enumerate(bars):
        x = left + 18 + step * (index + 0.5)
        opened, high, low, close = map(float, (row["open"], row["high"], row["low"], row["close"]))
        colour = "#22C55E" if close >= opened else "#EF4444"
        draw.line((x, py(high), x, py(low)), fill=colour, width=2)
        y1, y2 = sorted((py(opened), py(close)))
        draw.rectangle((x - candle_width / 2, y1, x + candle_width / 2, max(y1 + 2, y2)), fill=colour)
    for values, colour, line_width in (
        (upper, "#FACC15", 2),
        (middle, "#94A3B8", 2),
        (lower, "#FACC15", 2),
    ):
        points = _line_points(values, left, step, py)
        if len(points) >= 2:
            draw.line(points, fill=colour, width=line_width)
    draw.text((left + 18, top + 12), "Candles · Bollinger 20,2", fill="#F8FAFC", font=small)

    vl, vt, vr, vb = volume_box
    maximum_volume = max(max(volumes), 1.0)
    for index, (row, volume) in enumerate(zip(bars, volumes, strict=True)):
        x = vl + 18 + step * (index + 0.5)
        candle_colour = "#22C55E" if float(row["close"]) >= float(row["open"]) else "#EF4444"
        y_value = vb - 14 - volume / maximum_volume * (vb - vt - 38)
        draw.rectangle((x - candle_width / 2, y_value, x + candle_width / 2, vb - 14), fill=candle_colour)
    draw.text((vl + 18, vt + 10), "VOLUME", fill="#94A3B8", font=small)

    rsi_values = _rsi(closes)
    rl, rt, rr, rb = rsi_box

    def ry(value: float) -> float:
        return rb - 18 - value / 100 * (rb - rt - 36)

    for level, colour in ((70, "#22C55E"), (50, "#FACC15"), (30, "#EF4444")):
        draw.line((rl + 8, ry(level), rr - 8, ry(level)), fill=colour, width=1)
        draw.text((rr - 42, ry(level) - 16), str(level), fill=colour, font=small)
    points = _line_points(rsi_values, rl, step, ry)
    if len(points) >= 2:
        draw.line(points, fill="#A78BFA", width=4)
    draw.text((rl + 18, rt + 12), "RSI 14", fill="#C4B5FD", font=small)

    macd_values, signal_values, histogram = _macd(closes)
    ml, mt, mr, mb = macd_box
    macd_numeric = [
        abs(value)
        for series in (macd_values, signal_values, histogram)
        for value in series
        if value is not None
    ]
    macd_span = max(macd_numeric, default=1.0)

    def my(value: float) -> float:
        return (mt + mb) / 2 - value / macd_span * (mb - mt - 42) / 2

    zero_y = my(0)
    draw.line((ml + 8, zero_y, mr - 8, zero_y), fill="#475569", width=1)
    for index, value in enumerate(histogram):
        if value is None:
            continue
        x = ml + 18 + step * (index + 0.5)
        draw.rectangle(
            (x - candle_width / 2, min(zero_y, my(value)), x + candle_width / 2, max(zero_y, my(value))),
            fill="#22C55E" if value >= 0 else "#EF4444",
        )
    for values, colour in ((macd_values, "#38BDF8"), (signal_values, "#F59E0B")):
        points = _line_points(values, ml, step, my)
        if len(points) >= 2:
            draw.line(points, fill=colour, width=3)
    draw.text((ml + 18, mt + 12), "MACD 12,26,9", fill="#F8FAFC", font=small)
    draw.text(
        (58, 1300),
        "PAPER ENTRY · Intraday evidence through fill · 52W references are clipped when outside the visible range",
        fill="#94A3B8",
        font=small,
    )
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()


def load_entry_evidence(db: Any, event: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    data = _data(event)
    symbol = str(data.get("symbol") or "").upper()
    side = str(data.get("side") or "BUY").upper()
    occurred = data.get("fill_time") or data.get("opened_at") or event.get("time")
    if not symbol or not occurred:
        return {}, []
    with db.connection() as conn:
        factor = conn.execute(
            """SELECT ofactor::text,xfactor_snapshot::text AS xfactor,rsi14::text,atr14::text,available_at
                 FROM oiis_live.daily_candidate
                WHERE upper(symbol)=upper(%s) AND direction=%s AND available_at<=%s::timestamptz + interval '5 minutes'
                ORDER BY available_at DESC LIMIT 1""",
            (symbol, "LONG" if side in {"BUY", "LONG"} else "SHORT", occurred),
        ).fetchone()
        instrument = conn.execute(
            """SELECT symbol_token FROM public.instruments
                WHERE exchange='NSE'
                  AND (upper(tradingsymbol)=upper(%s)
                       OR upper(tradingsymbol)=upper(%s || '-EQ')
                       OR upper(name)=upper(%s))
                ORDER BY CASE
                           WHEN upper(tradingsymbol)=upper(%s || '-EQ') THEN 0
                           WHEN upper(tradingsymbol)=upper(%s) THEN 1
                           ELSE 2
                         END,
                         updated_at DESC
                LIMIT 1""",
            (symbol, symbol, symbol, symbol, symbol),
        ).fetchone()
        profile = conn.execute(
            """SELECT company_name,sector,market_cap_bucket
                 FROM public.instrument_profiles
                WHERE upper(symbol)=upper(%s)
                LIMIT 1""",
            (symbol,),
        ).fetchone()
        range_52w = conn.execute(
            """WITH yahoo AS (
                   SELECT high_price * CASE WHEN close_price<>0 THEN adj_close/close_price ELSE 1 END AS high,
                          low_price * CASE WHEN close_price<>0 THEN adj_close/close_price ELSE 1 END AS low
                     FROM strategy_eval.stock_daily_regime
                    WHERE upper(regexp_replace(yahoo_symbol,'\\.NS$',''))=upper(%s)
                      AND trade_date BETWEEN
                          ((%s::timestamptz AT TIME ZONE 'Asia/Kolkata')::date - 370)
                          AND (%s::timestamptz AT TIME ZONE 'Asia/Kolkata')::date
                 ), live AS (
                   SELECT high,low FROM public.bars_1d
                    WHERE exchange='NSE' AND symbol_token=%s
                      AND trade_date BETWEEN
                          ((%s::timestamptz AT TIME ZONE 'Asia/Kolkata')::date - 370)
                          AND (%s::timestamptz AT TIME ZONE 'Asia/Kolkata')::date
                 ), combined AS (
                   SELECT high,low FROM yahoo UNION ALL SELECT high,low FROM live
                 )
                 SELECT max(high)::text AS week52_high,min(low)::text AS week52_low
                   FROM combined""",
            (
                symbol,
                occurred,
                occurred,
                instrument["symbol_token"] if instrument else None,
                occurred,
                occurred,
            ),
        ).fetchone()
        recommendations = conn.execute(
            """SELECT report_date,
                      coalesce(nullif(broker_name,''),nullif(research_house,''),'Research house') AS house,
                      recommendation,target_price::text,upside_pct::text
                 FROM research.trendlyne_reports
                WHERE upper(nse_symbol)=upper(%s)
                  AND lower(coalesce(recommendation,'')) LIKE '%%buy%%'
                  AND report_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
                  AND report_date::date BETWEEN
                      ((%s::timestamptz AT TIME ZONE 'Asia/Kolkata')::date - 29)
                      AND (%s::timestamptz AT TIME ZONE 'Asia/Kolkata')::date
                ORDER BY report_date::date DESC,coalesce(broker_name,research_house),target_price DESC NULLS LAST
                LIMIT 3""",
            (symbol, occurred, occurred),
        ).fetchall()
        market_book = None
        trade_leg_id = data.get("trade_leg_id")
        if trade_leg_id:
            market_book = conn.execute(
                """SELECT availability_status,quote_ts,quote_age_ms::text,quote_source,
                          ltp::text,last_trade_qty::text,cumulative_volume::text,
                          total_buy_qty::text,total_sell_qty::text,
                          best_bid_price::text,best_bid_qty::text,
                          best_ask_price::text,best_ask_qty::text,
                          bid_levels,ask_levels,bid_level_count,ask_level_count
                     FROM paper_trading.entry_market_evidence
                    WHERE trade_leg_id=%s::uuid
                    ORDER BY fill_at DESC LIMIT 1""",
                (trade_leg_id,),
            ).fetchone()
        bars = (
            conn.execute(
                """SELECT b.ts,b.open::text,b.high::text,b.low::text,b.close::text,b.volume
                 FROM public.bars_1m b
                WHERE b.exchange='NSE' AND b.symbol_token=%s
                  AND b.ts >= date_trunc('day', %s::timestamptz AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'
                  AND b.ts <= %s::timestamptz ORDER BY b.ts DESC LIMIT 120""",
                (instrument["symbol_token"], occurred, occurred),
            ).fetchall()
            if instrument
            else []
        )
    evidence = dict(factor) if factor else {}
    if profile:
        evidence.update(dict(profile))
    if range_52w:
        evidence.update(dict(range_52w))
    evidence["trendlyne_buy_recommendations"] = [dict(row) for row in recommendations]
    evidence["entry_market_book"] = dict(market_book) if market_book else None
    entry = _number(data.get("fill_price") or data.get("entry_price"))
    high = _number(evidence.get("week52_high"))
    low = _number(evidence.get("week52_low"))
    if entry is not None and high is not None and low is not None and high > low:
        position = max(Decimal("0"), min(Decimal("100"), (entry - low) * 100 / (high - low)))
        evidence["week52_position_pct"] = str(position)
    return evidence, [dict(row) for row in reversed(bars)]


def build_gateway_payload(
    event: dict[str, Any],
    decision: DeliveryDecision,
    chat_id: str,
    factors: dict[str, Any],
    chart: bytes | None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {"chatId": chat_id, "message": render_message(event, decision, factors)}
    if chart:
        symbol = _clean(_data(event).get("symbol") or "paper-trade", 24).lower()
        payload.update(
            {
                "media": {
                    "mimetype": "image/png",
                    "data": base64.b64encode(chart).decode("ascii"),
                    "filename": f"{symbol}-paper-entry.png",
                },
                "asDocument": False,
            }
        )
    return payload
