import re
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]

ALLOWED_HEX = {
    "#000000", "#FFFFFF",
    "#FF0033", "#D9002B", "#B20024", "#8C001C", "#660014",
    "#00FF66", "#00D957", "#00B247", "#008C38", "#006629",
}

HEX_RE = re.compile(r"#[0-9a-fA-F]{3,8}")


def _normalize_hex(h: str) -> str:
    h = h.upper()
    if len(h) == 4:  # #RGB -> #RRGGBB
        return "#" + "".join([c * 2 for c in h[1:]])
    return h


def test_no_forbidden_hex_colors():
    offenders = []
    for p in list((BASE / "static").rglob("*")) + list((BASE / "app").rglob("*.py")):
        if p.is_dir():
            continue
        if p.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico"}:
            continue
        text = p.read_text(encoding="utf-8", errors="ignore")
        for match in HEX_RE.findall(text):
            hx = _normalize_hex(match)
            if hx not in ALLOWED_HEX:
                offenders.append((str(p.relative_to(BASE)), match))
    assert not offenders, f"Forbidden hex colors found: {offenders[:12]}"
