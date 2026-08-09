from datetime import UTC, date, datetime

from oiis_live.main import trade_payload


def test_oiis_trade_uses_lifecycle_specific_actual_exits() -> None:
    item = {"symbol":"RELIANCE","instrument_token":"2885","trade_date":date(2026,8,10),
            "signal_date":date(2026,8,7),"ofactor":80,"xfactor_snapshot":82,"daily_level":"MEDIUM",
            "candidate_id":"candidate-1","canonical_status":"QUALIFIED_FOR_INTRADAY_REVALIDATION"}
    bar = {"ts":datetime(2026,8,10,4,30,tzinfo=UTC),"close":100,"source":"ws"}
    payload = trade_payload(item,bar,25,-90,2000,"event-1")
    rules = payload["execution_policy"]["exit_rules"]
    assert rules == [
        {"rule_id":"I030","kind":"TARGET_PCT","value":"0.003","action":"FULL_CLOSE","target_lifecycle":"INTRADAY"},
        {"rule_id":"S100","kind":"TARGET_PCT","value":"0.010","action":"FULL_CLOSE","target_lifecycle":"SWING"},
    ]
    assert payload["analytics_policy"]["intraday_targets_pct"] == ["0.003","0.005","0.007"]
    assert payload["analytics_policy"]["swing_targets_pct"] == ["0.010","0.020","0.050"]
    assert "OFACTOR_XFACTOR_QUALIFIED" in payload["signal"]["reason_codes"]
    assert payload["metadata"]["operator_override"] is False


def test_manual_entry_enable_is_audited_as_operator_override() -> None:
    item = {"symbol":"RELIANCE","instrument_token":"2885","trade_date":date(2026,8,10),
            "signal_date":None,"ofactor":None,"xfactor_snapshot":None,"daily_level":"LOW",
            "candidate_id":None,"canonical_status":"MANUAL_MONITOR_ONLY"}
    bar = {"ts":datetime(2026,8,10,4,30,tzinfo=UTC),"close":100,"source":"ws"}
    payload = trade_payload(item,bar,25,-90,2000,"event-manual")
    assert "MANUAL_WATCHLIST_ENTRY_ENABLED" in payload["signal"]["reason_codes"]
    assert "OPERATOR_ENTRY_OVERRIDE" in payload["signal"]["reason_codes"]
    assert payload["metadata"]["operator_override"] is True
