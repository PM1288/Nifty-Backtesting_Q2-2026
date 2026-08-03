from datetime import datetime, timezone
from pathlib import Path

from nifty_stratlab.demo.synthetic import synthetic_equity_frame
from nifty_stratlab.live.parity import compare_batch_and_online
from nifty_stratlab.reporting.research_pack import ResearchPackBuilder, ResearchPackRequest, verify_research_pack


def test_reference_online_replay_matches_batch():
    frame = synthetic_equity_frame(symbols=("AAA", "BBB"), bars_per_symbol=70, seed=1)
    assert compare_batch_and_online(frame) == []


def test_research_pack_is_checksummed_and_safe(tmp_path: Path):
    output = tmp_path / "pack.zip"
    request = ResearchPackRequest(
        as_of=datetime.now(timezone.utc), symbols=("AAA",), purpose="test",
        data_snapshot_id="d1",
    )
    builder = ResearchPackBuilder(request)
    builder.add_frame("data/bars.csv", synthetic_equity_frame(symbols=("AAA",), bars_per_symbol=5))
    builder.add_markdown_section("Test", "Evidence")
    result = builder.build(output)
    verified = verify_research_pack(output)
    assert result["zip_sha256"] == verified["zip_sha256"]
    assert verified["valid"]


def test_same_research_pack_request_is_byte_deterministic(tmp_path: Path):
    request = ResearchPackRequest(
        as_of=datetime(2026, 8, 2, 9, 0, tzinfo=timezone.utc),
        symbols=("AAA",), purpose="determinism", data_snapshot_id="d1",
    )
    hashes = []
    for number in (1, 2):
        builder = ResearchPackBuilder(request)
        builder.add_frame("data/bars.csv", synthetic_equity_frame(symbols=("AAA",), bars_per_symbol=5))
        builder.add_markdown_section("Test", "Evidence")
        hashes.append(builder.build(tmp_path / f"pack-{number}.zip")["zip_sha256"])
    assert hashes[0] == hashes[1]
