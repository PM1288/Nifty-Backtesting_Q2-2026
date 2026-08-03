from __future__ import annotations

import importlib
import inspect
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Protocol, Sequence

import yaml
from pydantic import BaseModel, ConfigDict, Field, model_validator

from nifty_stratlab.contracts import SignalIntent, Side
from nifty_stratlab.util.hashing import sha256_file, stable_id


class StrategyManifest(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    strategy_id: str
    strategy_version_id: str
    display_name: str
    version: int = Field(gt=0)
    archetype: str
    plugin: str
    supported_intervals: tuple[str, ...]
    required_features: tuple[str, ...]
    parameters: dict[str, Any]
    assumptions: dict[str, Any]
    owner: str
    status: str = "draft"
    entry_timing: str = "next_bar_open"
    source_hash: str | None = None

    @model_validator(mode="after")
    def immutable_version(self) -> "StrategyManifest":
        if not self.strategy_version_id.endswith(f"_v{self.version}"):
            raise ValueError("strategy_version_id must end with _v<version>")
        return self


@dataclass(frozen=True)
class StrategyBar:
    symbol: str
    instrument_id: str
    event_ts: datetime
    available_at: datetime
    interval: str
    open: float
    high: float
    low: float
    close: float
    volume: int
    features: dict[str, float | int | bool | str | None]


@dataclass(frozen=True)
class StrategyContext:
    manifest: StrategyManifest
    current: StrategyBar
    previous: StrategyBar | None
    position_open: bool
    bars_since_entry: int | None = None


class StrategyPlugin(Protocol):
    manifest: StrategyManifest

    def on_bar(self, context: StrategyContext) -> Sequence[SignalIntent]:
        ...


class BaseStrategy:
    def __init__(self, manifest: StrategyManifest) -> None:
        self.manifest = manifest

    def entry_signal(self, context: StrategyContext, reason_codes: Sequence[str], metadata: dict[str, Any] | None = None) -> SignalIntent:
        current = context.current
        return SignalIntent(
            signal_id=stable_id(
                "sig",
                {
                    "strategy": self.manifest.strategy_version_id,
                    "instrument": current.instrument_id,
                    "event_ts": current.event_ts,
                    "intent": "enter",
                },
            ),
            strategy_version_id=self.manifest.strategy_version_id,
            instrument_id=current.instrument_id,
            symbol=current.symbol,
            decision_ts=current.available_at,
            available_at=current.available_at,
            side=Side.BUY,
            intent_type="enter",
            reason_codes=tuple(reason_codes),
            metadata=metadata or {},
        )

    def exit_signal(self, context: StrategyContext, reason_codes: Sequence[str], metadata: dict[str, Any] | None = None) -> SignalIntent:
        current = context.current
        return SignalIntent(
            signal_id=stable_id(
                "sig",
                {
                    "strategy": self.manifest.strategy_version_id,
                    "instrument": current.instrument_id,
                    "event_ts": current.event_ts,
                    "intent": "exit",
                },
            ),
            strategy_version_id=self.manifest.strategy_version_id,
            instrument_id=current.instrument_id,
            symbol=current.symbol,
            decision_ts=current.available_at,
            available_at=current.available_at,
            side=Side.SELL,
            intent_type="exit",
            reason_codes=tuple(reason_codes),
            metadata=metadata or {},
        )


class StrategyRegistry:
    def __init__(self) -> None:
        self._plugins: dict[str, StrategyPlugin] = {}

    def register(self, plugin: StrategyPlugin) -> None:
        version_id = plugin.manifest.strategy_version_id
        if version_id in self._plugins:
            raise ValueError(f"strategy version already registered: {version_id}")
        self._plugins[version_id] = plugin

    def get(self, strategy_version_id: str) -> StrategyPlugin:
        try:
            return self._plugins[strategy_version_id]
        except KeyError as exc:
            raise KeyError(f"unknown strategy version: {strategy_version_id}") from exc

    @property
    def versions(self) -> tuple[str, ...]:
        return tuple(sorted(self._plugins))


def load_manifest(path: str | Path) -> StrategyManifest:
    manifest_path = Path(path)
    with manifest_path.open("r", encoding="utf-8") as stream:
        raw = yaml.safe_load(stream) or {}
    manifest = StrategyManifest.model_validate(raw)
    module_name, class_name = manifest.plugin.split(":", 1)
    module = importlib.import_module(module_name)
    plugin_class = getattr(module, class_name)
    source_path = inspect.getsourcefile(plugin_class)
    source_hash = sha256_file(source_path) if source_path else None
    if manifest.source_hash and manifest.source_hash != source_hash:
        raise ValueError(f"strategy source hash mismatch for {manifest.strategy_version_id}")
    return manifest


def instantiate_strategy(manifest: StrategyManifest) -> StrategyPlugin:
    module_name, class_name = manifest.plugin.split(":", 1)
    module = importlib.import_module(module_name)
    plugin_class = getattr(module, class_name)
    plugin = plugin_class(manifest)
    if not hasattr(plugin, "on_bar"):
        raise TypeError(f"{manifest.plugin} does not implement on_bar")
    return plugin
