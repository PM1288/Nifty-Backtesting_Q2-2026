from __future__ import annotations

import base64
import io
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


def _when(value: Any) -> str:
    if not value:
        return "time unavailable"
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00")).astimezone(IST)
    except (TypeError, ValueError):
        return "time unavailable"
    return parsed.strftime("%d %b %Y · %H:%M:%S IST")


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
    rows = [(label, value) for label, value in rows if value != "—"][:8]
    width = min(16, max((len(label) for label, _ in rows), default=0))
    return "```\n" + "\n".join(f"{label:<{width}}  {value}" for label, value in rows) + "\n```"


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
    lines = [f"{icon_title[0]} *{icon_title[1]}* · `{side}`", f"`{symbol} · NSE`", f"Trade `{trade_ref}`"]
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
            ("O factor", _clean(factors.get("ofactor") or "—")),
            ("X factor", _clean(factors.get("xfactor") or "—")),
            ("RSI 14", _clean(factors.get("rsi14") or "—")),
        ]
        reason = data.get("entry_reason") or "Paper fill recorded; monitoring targets and risk path."
    elif decision.kind == "TARGET":
        tracks = (
            data.get("newly_closed_target_tracks")
            if isinstance(data.get("newly_closed_target_tracks"), list)
            else []
        )
        target = tracks[0] if tracks and isinstance(tracks[0], dict) else {}
        rows = [
            ("Entry", _money(data.get("entry_price"))),
            ("Target", _money(target.get("target_price") or data.get("target_price"))),
            ("Observed", _money(target.get("observed_price") or data.get("current_price"))),
            ("Target move", _pct(target.get("target_pct") or data.get("target_pct"), ratio=True)),
            ("MFE", _pct(data.get("mfe"), ratio=True)),
            ("MAE", _pct(data.get("mae"), ratio=True)),
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
            ("MFE", _pct(data.get("mfe"), ratio=True)),
            ("MAE", _pct(data.get("mae"), ratio=True)),
        ]
        reason = data.get("exit_reason_code") or "Governed paper exit completed."
    elif decision.kind in {"DAILY_SUMMARY", "WEEKLY_SUMMARY"}:
        summary: dict[str, Any] = data["summary"] if isinstance(data.get("summary"), dict) else data
        rows = [
            ("Requests", _qty(summary.get("requests_received"))),
            ("Opened", _qty(summary.get("groups_opened"))),
            ("Closed", _qty(summary.get("groups_closed"))),
            ("Realised", _money(summary.get("net_realised_pnl"), signed=True)),
            ("Open P&L", _money(summary.get("unrealised_pnl"), signed=True)),
            ("Win rate", _pct(summary.get("win_rate_pct"))),
        ]
    else:
        rows = [
            ("Status", decision.kind),
            ("Affected", _qty(data.get("affected_count"))),
            ("Duration", f"{int(_number(data.get('duration_seconds')) or 0) // 60} min"),
        ]
    if rows:
        lines.extend(["", _rows_table(rows)])
    if reason:
        lines.extend(["", f"> {_clean(reason, 240)}"])
    if strategy:
        lines.extend(["", f"Strategy `{strategy}`"])
    lines.extend([f"`{_when(event.get('time'))}`", "⚠️ *Simulation only. No live order was placed.*"])
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


def render_entry_chart(
    bars: list[dict[str, Any]], entry_price: Any, symbol: str, factors: dict[str, Any]
) -> bytes | None:
    if len(bars) < 3:
        return None
    width, height = 1080, 1080
    image = Image.new("RGB", (width, height), "#0B1220")
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default(size=24)
    small = ImageFont.load_default(size=18)
    draw.text((58, 38), f"{_clean(symbol, 24).upper()} · PAPER ENTRY EVIDENCE", fill="#F8FAFC", font=font)
    draw.text(
        (58, 78),
        f"O {factors.get('ofactor', '—')}   X {factors.get('xfactor', '—')}   RSI {factors.get('rsi14', '—')}",
        fill="#94A3B8",
        font=small,
    )
    chart = (70, 140, 1010, 730)
    rsi_box = (70, 790, 1010, 990)
    for box in (chart, rsi_box):
        draw.rounded_rectangle(box, radius=14, fill="#111827", outline="#334155", width=2)
    highs = [float(row["high"]) for row in bars]
    lows = [float(row["low"]) for row in bars]
    closes = [float(row["close"]) for row in bars]
    price_min, price_max = min(lows), max(highs)
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
    for index, row in enumerate(bars):
        x = left + 18 + step * (index + 0.5)
        opened, high, low, close = map(float, (row["open"], row["high"], row["low"], row["close"]))
        colour = "#22C55E" if close >= opened else "#EF4444"
        draw.line((x, py(high), x, py(low)), fill=colour, width=2)
        y1, y2 = sorted((py(opened), py(close)))
        draw.rectangle((x - candle_width / 2, y1, x + candle_width / 2, max(y1 + 2, y2)), fill=colour)
    rsi_values = _rsi(closes)
    rl, rt, rr, rb = rsi_box

    def ry(value: float) -> float:
        return rb - 18 - value / 100 * (rb - rt - 36)

    for level, colour in ((70, "#22C55E"), (50, "#FACC15"), (30, "#EF4444")):
        draw.line((rl + 8, ry(level), rr - 8, ry(level)), fill=colour, width=1)
        draw.text((rr - 42, ry(level) - 16), str(level), fill=colour, font=small)
    points = [
        (rl + 18 + step * (index + 0.5), ry(value))
        for index, value in enumerate(rsi_values)
        if value is not None
    ]
    if len(points) >= 2:
        draw.line(points, fill="#A78BFA", width=4)
    draw.text((rl + 18, rt + 12), "RSI 14", fill="#C4B5FD", font=small)
    draw.text(
        (58, 1025),
        "PAPER TRADE · Intraday candles through entry · Blue line marks simulated fill",
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
    return (dict(factor) if factor else {}), [dict(row) for row in reversed(bars)]


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
