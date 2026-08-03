from __future__ import annotations

import json
import pickle
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import numpy as np
from sklearn.impute import SimpleImputer
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, log_loss, roc_auc_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from nifty_stratlab.discovery.walkforward import WalkForwardSplit
from nifty_stratlab.util.hashing import sha256_file, stable_id


@dataclass(frozen=True)
class CalibrationBin:
    lower: float
    upper: float
    count: int
    mean_prediction: float | None
    observed_rate: float | None


@dataclass(frozen=True)
class CalibrationEvidence:
    sample_count: int
    positive_count: int
    brier_score: float
    log_loss: float
    roc_auc: float | None
    expected_calibration_error: float
    bins: tuple[CalibrationBin, ...]


def calibration_evidence(y_true: np.ndarray, probabilities: np.ndarray, bins: int = 10) -> CalibrationEvidence:
    y = np.asarray(y_true, dtype=int)
    p = np.clip(np.asarray(probabilities, dtype=float), 1e-9, 1 - 1e-9)
    if y.shape != p.shape:
        raise ValueError("y_true and probabilities must have the same shape")
    boundaries = np.linspace(0.0, 1.0, bins + 1)
    output: list[CalibrationBin] = []
    ece = 0.0
    for index in range(bins):
        lower, upper = float(boundaries[index]), float(boundaries[index + 1])
        mask = (p >= lower) & (p < upper if index < bins - 1 else p <= upper)
        count = int(mask.sum())
        if count:
            mean_prediction = float(p[mask].mean())
            observed = float(y[mask].mean())
            ece += count / len(y) * abs(mean_prediction - observed)
        else:
            mean_prediction = observed = None
        output.append(CalibrationBin(lower, upper, count, mean_prediction, observed))
    auc = None
    if len(np.unique(y)) == 2:
        auc = float(roc_auc_score(y, p))
    return CalibrationEvidence(
        sample_count=len(y),
        positive_count=int(y.sum()),
        brier_score=float(brier_score_loss(y, p)),
        log_loss=float(log_loss(y, p, labels=[0, 1])),
        roc_auc=auc,
        expected_calibration_error=float(ece),
        bins=tuple(output),
    )


class ChronologicalProbabilityModel:
    """Logistic baseline with chronological OOF isotonic calibration."""

    def __init__(self, feature_names: Iterable[str], random_state: int = 0) -> None:
        self.feature_names = tuple(feature_names)
        if not self.feature_names:
            raise ValueError("at least one feature is required")
        self.random_state = random_state
        self.base_model: Pipeline | None = None
        self.calibrator: IsotonicRegression | None = None
        self.oof_evidence: CalibrationEvidence | None = None
        self.model_id: str | None = None

    def _new_base(self) -> Pipeline:
        return Pipeline(
            [
                ("imputer", SimpleImputer(strategy="median")),
                ("scale", StandardScaler()),
                ("model", LogisticRegression(max_iter=2000, class_weight="balanced", random_state=self.random_state)),
            ]
        )

    def fit(self, X: np.ndarray, y: np.ndarray, splits: list[WalkForwardSplit]) -> CalibrationEvidence:
        values = np.asarray(X, dtype=float)
        labels = np.asarray(y, dtype=int)
        if values.ndim != 2 or values.shape[1] != len(self.feature_names):
            raise ValueError("X shape does not match feature_names")
        if values.shape[0] != labels.shape[0]:
            raise ValueError("X and y row counts differ")
        predictions = np.full(len(labels), np.nan, dtype=float)
        for split in splits:
            train_x = values[split.train_start:split.train_end]
            train_y = labels[split.train_start:split.train_end]
            test_x = values[split.test_start:split.test_end]
            if len(np.unique(train_y)) < 2:
                continue
            model = self._new_base()
            model.fit(train_x, train_y)
            predictions[split.test_start:split.test_end] = model.predict_proba(test_x)[:, 1]
        valid = np.isfinite(predictions)
        if int(valid.sum()) < 30 or len(np.unique(labels[valid])) < 2:
            raise ValueError("insufficient chronological out-of-fold evidence for calibration")
        self.calibrator = IsotonicRegression(out_of_bounds="clip")
        self.calibrator.fit(predictions[valid], labels[valid])
        calibrated = self.calibrator.predict(predictions[valid])
        self.oof_evidence = calibration_evidence(labels[valid], calibrated)
        self.base_model = self._new_base()
        self.base_model.fit(values, labels)
        self.model_id = stable_id(
            "model",
            {
                "features": self.feature_names,
                "rows": len(labels),
                "positives": int(labels.sum()),
                "random_state": self.random_state,
                "evidence": self.oof_evidence,
            },
            length=32,
        )
        return self.oof_evidence

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        if self.base_model is None or self.calibrator is None:
            raise RuntimeError("model is not fitted")
        raw = self.base_model.predict_proba(np.asarray(X, dtype=float))[:, 1]
        return np.asarray(self.calibrator.predict(raw), dtype=float)

    def save(self, folder: str | Path) -> dict:
        if self.base_model is None or self.calibrator is None or self.oof_evidence is None:
            raise RuntimeError("model is not fitted")
        target = Path(folder)
        target.mkdir(parents=True, exist_ok=True)
        binary = target / "model.pkl"
        with binary.open("wb") as stream:
            pickle.dump(self, stream, protocol=pickle.HIGHEST_PROTOCOL)
        manifest = {
            "model_id": self.model_id,
            "feature_names": self.feature_names,
            "random_state": self.random_state,
            "oof_evidence": {
                **self.oof_evidence.__dict__,
                "bins": [item.__dict__ for item in self.oof_evidence.bins],
            },
            "binary_sha256": sha256_file(binary),
        }
        (target / "model_manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        return manifest

    @staticmethod
    def load(folder: str | Path) -> "ChronologicalProbabilityModel":
        target = Path(folder)
        manifest = json.loads((target / "model_manifest.json").read_text(encoding="utf-8"))
        binary = target / "model.pkl"
        if sha256_file(binary) != manifest["binary_sha256"]:
            raise ValueError("model artifact checksum mismatch")
        with binary.open("rb") as stream:
            model = pickle.load(stream)
        if not isinstance(model, ChronologicalProbabilityModel):
            raise TypeError("unexpected model artifact type")
        return model
