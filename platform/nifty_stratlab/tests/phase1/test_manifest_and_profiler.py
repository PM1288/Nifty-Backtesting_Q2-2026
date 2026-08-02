from pathlib import Path

from nifty_stratlab.data.csv_profiler import profile_csv
from nifty_stratlab.data.manifest import build_source_record


def test_manifest_is_checksum_identified(tmp_path: Path):
    path = tmp_path / "sample.csv"
    path.write_text("date,open,high,low,close,volume\n2026-08-04 09:15,100,102,99,101,10\n", encoding="utf-8")
    first = build_source_record(path, dataset_name="test", root=tmp_path)
    second = build_source_record(path, dataset_name="test", root=tmp_path)
    assert first.source_file_id == second.source_file_id
    assert len(first.sha256) == 64


def test_profiler_detects_conflicting_duplicates(tmp_path: Path):
    path = tmp_path / "bad.csv"
    path.write_text(
        "date,open,high,low,close,volume\n"
        "2026-08-04 09:15,100,102,99,101,10\n"
        "2026-08-04 09:15,100,103,99,102,10\n",
        encoding="utf-8",
    )
    result = profile_csv(path)
    assert result.duplicate_timestamps == 1
    assert result.conflicting_duplicates == 1
    assert result.status == "FAIL"
