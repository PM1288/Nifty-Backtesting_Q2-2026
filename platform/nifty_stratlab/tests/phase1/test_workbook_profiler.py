from pathlib import Path

from openpyxl import Workbook

from nifty_stratlab.data.workbook_profiler import profile_workbook


def test_workbook_profile_records_sheet_structure(tmp_path: Path):
    path = tmp_path / "source.xlsx"
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "FII DII"
    sheet.append(["Date", "FII"])
    sheet.append(["2023-07-01", 42])
    workbook.save(path)
    result = profile_workbook(path)
    assert result.status == "WARN"
    assert result.sheets[0]["name"] == "FII DII"
    assert result.sheets[0]["headers"] == ["Date", "FII"]
