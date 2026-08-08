import pytest

from nifty_stratlab.oiis.engine import OFACTOR_WEIGHTS, XFACTOR_WEIGHTS
from nifty_stratlab.oiis_doe.study import (
    ALL_COMPONENTS, ablated_weights, component_trials, jointly_ablated_weights,
    neutral_trial, redundancy_trials, validate_corporate_action_coverage,
    validate_point_in_time_panels, validate_skip_reason, wilson_interval,
)


def test_all_18_primary_component_trials_are_declared() -> None:
    trials = component_trials()
    assert len(trials) == 18
    assert {trial.component for trial in trials} == set(ALL_COMPONENTS)
    assert len({trial.trial_id for trial in trials}) == 18


@pytest.mark.parametrize("weights", [OFACTOR_WEIGHTS, XFACTOR_WEIGHTS])
def test_every_ablation_is_zero_and_exactly_renormalised(weights) -> None:
    for component in weights:
        result = ablated_weights(weights, component)
        assert result[component] == 0
        assert sum(result.values()) == pytest.approx(100)
        assert set(result) == set(weights)


def test_skip_reason_contract_rejects_unexplained_other() -> None:
    validate_skip_reason("MINUTE_FILE_NOT_FOUND")
    with pytest.raises(ValueError):
        validate_skip_reason("OTHER_EXPLAINED")
    validate_skip_reason("OTHER_EXPLAINED", "explicit operator detail")


def test_wilson_interval_is_bounded() -> None:
    low, high = wilson_interval(8, 23)
    assert 0 <= low < 100 * 8 / 23 < high <= 100


def test_joint_ablation_is_exactly_renormalised() -> None:
    result = jointly_ablated_weights(XFACTOR_WEIGHTS, ("setup_integrity", "trigger_confirmation"))
    assert result["setup_integrity"] == 0
    assert result["trigger_confirmation"] == 0
    assert sum(result.values()) == pytest.approx(100)


def test_three_focused_double_off_cells_are_declared() -> None:
    trials = redundancy_trials()
    assert {trial.trial_id for trial in trials} == {
        "S2X_ABLATE_SIS_TCS", "S2OX_ABLATE_LTS_LSQ", "S2O_ABLATE_MFS_ICS",
    }


def test_neutral_score_sensitivity_preserves_canonical_weights() -> None:
    trial = neutral_trial("timing_session_quality")
    assert trial.neutral_components == ("timing_session_quality",)
    assert trial.xfactor_weights == XFACTOR_WEIGHTS
    assert trial.trial_type == "RESEARCH_NEUTRAL_SCORE_SENSITIVITY"


def test_repeated_current_panel_is_blocked_as_survivorship_leakage() -> None:
    assert validate_point_in_time_panels(2695, 1) == "BLOCKED_LEAKAGE"
    assert validate_point_in_time_panels(12, 12) == "PASS"


def test_late_corporate_action_feed_blocks_historical_study() -> None:
    from datetime import date
    assert validate_corporate_action_coverage(date(2024, 1, 1), date(2026, 2, 20)) == "BLOCKED_DATA"
    assert validate_corporate_action_coverage(date(2024, 1, 1), date(2010, 1, 1)) == "PASS"
