"""Pedantic (strict) data models for Catan settings and trade payloads.

These models use pydantic when available and fall back to runtime-validated dataclasses
when pydantic is not installed.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List

RESOURCES = ["wood", "brick", "sheep", "wheat", "ore"]


class ModelValidationError(ValueError):
    """Raised when a model payload fails validation."""


def _validate_resource_name(name: str) -> str:
    if name not in RESOURCES:
        raise ModelValidationError(f"Invalid resource '{name}'. Expected one of: {', '.join(RESOURCES)}")
    return name


def _validate_positive(value: int, field_name: str) -> int:
    if value < 1:
        raise ModelValidationError(f"{field_name} must be >= 1")
    return value


try:
    from pydantic import BaseModel, Field, field_validator

    class PlayerConfig(BaseModel):
        name: str = Field(min_length=1, max_length=32)

    class GameConfig(BaseModel):
        players: List[PlayerConfig] = Field(min_length=3, max_length=4)
        turn_seconds: int = Field(default=60, ge=10, le=300)

    class TradeOffer(BaseModel):
        give_resource: str
        give_amount: int = Field(ge=1)
        get_resource: str
        get_amount: int = Field(ge=1)

        @field_validator("give_resource", "get_resource")
        @classmethod
        def resource_names_must_be_known(cls, value: str) -> str:
            return _validate_resource_name(value)

    class HandSnapshot(BaseModel):
        hand: Dict[str, int]

        @field_validator("hand")
        @classmethod
        def keys_and_counts_are_valid(cls, hand: Dict[str, int]) -> Dict[str, int]:
            validated: Dict[str, int] = {}
            for resource, count in hand.items():
                _validate_resource_name(resource)
                if count < 0:
                    raise ModelValidationError("Resource counts cannot be negative")
                validated[resource] = count
            return validated

except ImportError:

    @dataclass(frozen=True)
    class PlayerConfig:
        name: str

        def __post_init__(self) -> None:
            if not self.name or len(self.name) > 32:
                raise ModelValidationError("name must be 1..32 characters")

    @dataclass(frozen=True)
    class GameConfig:
        players: List[PlayerConfig]
        turn_seconds: int = 60

        def __post_init__(self) -> None:
            if len(self.players) < 3 or len(self.players) > 4:
                raise ModelValidationError("players must contain between 3 and 4 players")
            if self.turn_seconds < 10 or self.turn_seconds > 300:
                raise ModelValidationError("turn_seconds must be between 10 and 300")

    @dataclass(frozen=True)
    class TradeOffer:
        give_resource: str
        give_amount: int
        get_resource: str
        get_amount: int

        def __post_init__(self) -> None:
            _validate_resource_name(self.give_resource)
            _validate_resource_name(self.get_resource)
            _validate_positive(self.give_amount, "give_amount")
            _validate_positive(self.get_amount, "get_amount")

    @dataclass(frozen=True)
    class HandSnapshot:
        hand: Dict[str, int]

        def __post_init__(self) -> None:
            for resource, count in self.hand.items():
                _validate_resource_name(resource)
                if count < 0:
                    raise ModelValidationError("Resource counts cannot be negative")
