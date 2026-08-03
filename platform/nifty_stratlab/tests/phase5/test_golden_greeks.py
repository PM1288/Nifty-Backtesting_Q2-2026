from __future__ import annotations

import json
from pathlib import Path

from nifty_stratlab.options.black_scholes import OptionType, black_scholes_greeks


def test_option_greek_golden_vector():
    repo = Path(__file__).resolve().parents[2]
    vector = json.loads((repo / "contracts/golden/option_greeks_vectors.json").read_text(encoding="utf-8"))
    inputs = dict(vector["inputs"])
    inputs["option_type"] = OptionType(inputs["option_type"])
    actual = black_scholes_greeks(**inputs)
    for name, expected in vector["expected"].items():
        assert abs(getattr(actual, name) - expected) < 1e-12
