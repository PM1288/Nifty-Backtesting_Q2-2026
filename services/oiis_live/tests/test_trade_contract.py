from datetime import UTC, date, datetime

from decimal import Decimal

from oiis_live.main import ENTRY_METHOD_PRICE_MOMENTUM, quality_sum, trade_payload


def test_oiis_trade_uses_lifecycle_specific_actual_exits() -> None:
    item = {"symbol":"RELIANCE","instrument_token":"2885","trade_date":date(2026,8,10),
            "signal_date":date(2026,8,7),"ofactor":80,"xfactor_snapshot":82,"daily_level":"MEDIUM",
            "candidate_id":"candidate-1","canonical_status":"QUALIFIED_FOR_INTRADAY_REVALIDATION"}
    bar = {"ts":datetime(2026,8,10,4,30,tzinfo=UTC),"close":100,"source":"ws"}
    payload = trade_payload(item,bar,25,-90,2000,"event-1")
    rules = payload["execution_policy"]["exit_rules"]
    assert rules == [
        {"rule_id":"I100","kind":"TARGET_PCT","value":"0.010","action":"FULL_CLOSE","target_lifecycle":"INTRADAY"},
        {"rule_id":"S300","kind":"TARGET_PCT","value":"0.030","action":"FULL_CLOSE","target_lifecycle":"SWING"},
    ]
    assert payload["analytics_policy"]["intraday_targets_pct"] == ["0.003","0.004","0.005","0.010"]
    assert payload["analytics_policy"]["swing_targets_pct"] == ["0.010","0.030","0.050"]
    assert "OFACTOR_XFACTOR_QUALIFIED" in payload["signal"]["reason_codes"]
    assert payload["metadata"]["operator_override"] is False
    assert payload["legs"][0]["quantity"] == {"value":"2000","unit":"SHARES"}
    assert payload["legs"][0]["instrument"]["lot_size"] == "2000"
    assert payload["metadata"]["sizing_policy"] == "ONE_CURRENT_FNO_LOT"


def test_manual_entry_enable_is_audited_as_operator_override() -> None:
    item = {"symbol":"RELIANCE","instrument_token":"2885","trade_date":date(2026,8,10),
            "signal_date":None,"ofactor":None,"xfactor_snapshot":None,"daily_level":"LOW",
            "candidate_id":None,"canonical_status":"MANUAL_MONITOR_ONLY"}
    bar = {"ts":datetime(2026,8,10,4,30,tzinfo=UTC),"close":100,"source":"ws"}
    payload = trade_payload(item,bar,25,-90,2000,"event-manual")
    assert "MANUAL_WATCHLIST_ENTRY_ENABLED" in payload["signal"]["reason_codes"]
    assert "OPERATOR_ENTRY_OVERRIDE" in payload["signal"]["reason_codes"]
    assert payload["metadata"]["operator_override"] is True


def test_quality_sum_requires_all_three_inputs_and_is_decimal() -> None:
    assert quality_sum({"ofactor":70.5,"xfactor":61,"data_quality":54}) == Decimal("185.5")
    assert quality_sum({"ofactor":90,"xfactor":90,"data_quality":None}) is None


def test_quality_threshold_payload_supports_short_paper_trade() -> None:
    item = {"symbol":"SBIN","instrument_token":"3045","trade_date":date(2026,8,11),
            "signal_date":date(2026,8,10),"ofactor":72,"xfactor_snapshot":64,
            "data_quality":55,"daily_level":"LOW","direction":"SHORT",
            "candidate_id":"candidate-2","canonical_status":"WATCH"}
    bar = {"ts":datetime(2026,8,11,8,30,tzinfo=UTC),"close":100,"source":"ws"}
    payload = trade_payload(item,bar,None,None,100,"event-quality","QUALITY_SUM_THRESHOLD",
                            "run-1","INTRADAY_1400",191,185)
    assert payload["environment"] == "PAPER"
    assert payload["signal"]["direction"] == "SHORT"
    assert payload["legs"][0]["side"] == "SELL"
    assert "QUALITY_SUM_ABOVE_THRESHOLD" in payload["signal"]["reason_codes"]
    assert payload["metadata"]["entry_rule"] == "QUALITY_SUM_THRESHOLD"
    assert payload["metadata"]["operator_override"] is False
    assert payload["legs"][0]["instrument"]["lot_size"] == "100"


def test_price_momentum_entry_is_a_distinct_trade_with_same_exit_policy() -> None:
    item = {"symbol":"RELIANCE","instrument_token":"2885","trade_date":date(2026,8,17),
            "signal_date":date(2026,8,14),"ofactor":80,"xfactor_snapshot":82,
            "data_quality":95,"daily_level":"HIGH","direction":"LONG",
            "candidate_id":"candidate-3","canonical_status":"QUALIFIED_FOR_INTRADAY_REVALIDATION"}
    bar = {"ts":datetime(2026,8,17,5,45,tzinfo=UTC),"close":102,"source":"ws"}
    evidence = {"previous_daily_close":100,"current_hour_close":102,
                "previous_hour_close":101,"current_15m_close":102,"previous_15m_close":101}
    payload = trade_payload(item,bar,None,None,500,"event-momentum",ENTRY_METHOD_PRICE_MOMENTUM,
                            entry_evidence=evidence)
    assert payload["strategy"]["strategy_name"] == "OIIS Daily Selection + Price Momentum 1D/1H/15M Entry"
    assert payload["metadata"]["entry_rule"] == ENTRY_METHOD_PRICE_MOMENTUM
    assert payload["metadata"]["one_entry_per_symbol_trade_date_per_method"] is True
    assert payload["metadata"]["entry_evidence"] == evidence
    assert payload["execution_policy"]["exit_rules"][0]["rule_id"] == "I100"
    assert payload["analytics_policy"]["horizons_trading_sessions"] == [5,30]
