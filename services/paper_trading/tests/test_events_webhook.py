from papertrade.events import canonical_json, cloud_event, sign


def test_cloudevent_is_paper_and_deterministic_signature() -> None:
    event = cloud_event("e", "com.papertrading.trade_group.opened.v1", "g", "c", 2, {"value": "1.00"})
    assert (
        event["specversion"] == "1.0"
        and event["data"]["environment"] == "PAPER"
        and event["data"]["display_label"] == "PAPER TRADE"
    )
    body = canonical_json(event)
    assert sign("100", body, "secret") == sign("100", body, "secret")
    assert sign("100", body, "secret") != sign("100", body, "different")
