from pathlib import Path

from openpyxl import Workbook

from nifty_stratlab.data.workbook_profiler import profile_workbook_structure


def test_workbook_profile_is_bounded_and_records_structure(tmp_path: Path):
    path = tmp_path / "source.xlsx"
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "FII DII"
    sheet.append(["Date", "FII"])
    for number in range(100):
        sheet.append([f"2023-07-{(number % 28) + 1:02d}", number])
    workbook.save(path)
    result = profile_workbook_structure(path, sample_rows=5)
    assert result.status == "WARN"
    assert result.sheets[0]["reported_rows"] == 101
    assert result.sheets[0]["sampled_rows"] == 5
    assert result.sheets[0]["headers"] == ["Date", "FII"]
