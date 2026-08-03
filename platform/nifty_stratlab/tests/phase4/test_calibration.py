import numpy as np

from nifty_stratlab.calibration.model import ChronologicalProbabilityModel
from nifty_stratlab.discovery.walkforward import expanding_walk_forward_splits


def test_chronological_model_emits_bounded_calibrated_probabilities(tmp_path):
    rng = np.random.default_rng(4)
    X = rng.normal(size=(700, 3))
    score = 1.2 * X[:, 0] - 0.8 * X[:, 1] + rng.normal(scale=0.5, size=700)
    y = (score > 0).astype(int)
    splits = expanding_walk_forward_splits(700, minimum_train=250, test_size=100, purge=5)
    model = ChronologicalProbabilityModel(("a", "b", "c"), random_state=4)
    evidence = model.fit(X, y, splits)
    probabilities = model.predict_proba(X[-20:])
    assert evidence.sample_count > 100
    assert np.all((probabilities >= 0) & (probabilities <= 1))
    manifest = model.save(tmp_path)
    loaded = ChronologicalProbabilityModel.load(tmp_path)
    assert np.allclose(probabilities, loaded.predict_proba(X[-20:]))
    assert manifest["model_id"]
