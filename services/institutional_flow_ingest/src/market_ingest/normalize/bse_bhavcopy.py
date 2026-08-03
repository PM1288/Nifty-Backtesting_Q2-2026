from __future__ import annotations

from io import BytesIO

import pandas as pd


def normalize_bse_bhavcopy(content: bytes, **_: object) -> pd.DataFrame:
    return pd.read_csv(BytesIO(content))
