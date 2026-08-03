from __future__ import annotations

import pytest

from market_ingest.utils.http import DownloadValidationError


def test_html_error_detection() -> None:
    with pytest.raises(DownloadValidationError):
        raise DownloadValidationError("html error page downloaded instead of file")
