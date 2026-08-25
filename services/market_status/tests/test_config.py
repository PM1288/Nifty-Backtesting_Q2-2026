from market_status.config import Settings


def test_safe_defaults_are_disabled_and_dry_run():
    settings = Settings(DATABASE_URL="postgresql://example.invalid/db")
    assert settings.notifications_enabled is False
    assert settings.dry_run is True
    assert settings.movers_count == 3
    assert settings.oiis_notify_on_score_only_change is False
    assert settings.oiis_notify_on_rank_only_change is False
    assert settings.oiis_send_clear_event is False
    assert settings.threshold_alert_percentages == "1.0,1.5,2.0"
    assert settings.delivery_ready()
