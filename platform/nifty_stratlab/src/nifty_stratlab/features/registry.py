from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Iterable

from nifty_stratlab.features.technical import FEATURE_DEFINITIONS, FeatureDefinition
from nifty_stratlab.util.hashing import stable_id


@dataclass(frozen=True)
class FeatureSet:
    feature_set_id: str
    name: str
    version: str
    features: tuple[FeatureDefinition, ...]

    @property
    def fingerprint(self) -> str:
        return stable_id(
            "fset",
            {
                "name": self.name,
                "version": self.version,
                "features": [asdict(feature) for feature in self.features],
            },
            length=32,
        )


def default_feature_set() -> FeatureSet:
    return FeatureSet(
        feature_set_id="equity_technical_context_v1",
        name="Equity technical and path context",
        version="1",
        features=tuple(FEATURE_DEFINITIONS),
    )


def validate_required_features(required: Iterable[str], feature_set: FeatureSet) -> None:
    available = {feature.slug for feature in feature_set.features}
    missing = sorted(set(required) - available)
    if missing:
        raise ValueError(f"strategy requires unregistered features: {', '.join(missing)}")
