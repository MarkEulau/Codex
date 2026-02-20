"""Strict validation models (Pydantic-style BaseModel classes) for Catan."""

from __future__ import annotations

from typing import Dict, List

from pydantic import BaseModel, ValidationError

RESOURCES = ["wood", "brick", "sheep", "wheat", "ore"]


class PlayerConfig(BaseModel):
    name: str

    def __init__(self, **data):
        super().__init__(**data)
        name = getattr(self, "name", "")
        if not isinstance(name, str) or not name.strip() or len(name.strip()) > 32:
            raise ValidationError("name must be a non-empty string of max length 32")
        self.name = name.strip()


class GameConfig(BaseModel):
    players: List[PlayerConfig]
    turn_seconds: int = 60

    def __init__(self, **data):
        super().__init__(**data)
        players = getattr(self, "players", None)
        if not isinstance(players, list) or not (3 <= len(players) <= 4):
            raise ValidationError("players must contain between 3 and 4 players")
        for idx, player in enumerate(players):
            if not isinstance(player, PlayerConfig):
                raise ValidationError(f"players[{idx}] must be PlayerConfig")

        turn_seconds = getattr(self, "turn_seconds", 60)
        if not isinstance(turn_seconds, int) or not (10 <= turn_seconds <= 300):
            raise ValidationError("turn_seconds must be an integer between 10 and 300")


class TradeOffer(BaseModel):
    give_resource: str
    give_amount: int
    get_resource: str
    get_amount: int

    def __init__(self, **data):
        super().__init__(**data)
        if self.give_resource not in RESOURCES:
            raise ValidationError("give_resource must be a known resource")
        if self.get_resource not in RESOURCES:
            raise ValidationError("get_resource must be a known resource")
        if self.give_resource == self.get_resource:
            raise ValidationError("give_resource and get_resource must differ")
        if not isinstance(self.give_amount, int) or self.give_amount < 1:
            raise ValidationError("give_amount must be >= 1")
        if not isinstance(self.get_amount, int) or self.get_amount < 1:
            raise ValidationError("get_amount must be >= 1")


class HandSnapshot(BaseModel):
    hand: Dict[str, int]

    def __init__(self, **data):
        super().__init__(**data)
        if not isinstance(self.hand, dict):
            raise ValidationError("hand must be a dict")
        for resource, count in self.hand.items():
            if resource not in RESOURCES:
                raise ValidationError(f"unknown resource: {resource}")
            if not isinstance(count, int) or count < 0:
                raise ValidationError("resource counts cannot be negative")
