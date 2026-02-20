# models.py — Dataclasses for Catan game entities

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set, Tuple

from constants import RESOURCES


@dataclass
class Player:
    name: str
    hand: Dict[str, int] = field(default_factory=lambda: {r: 0 for r in RESOURCES})
    roads: Set[int] = field(default_factory=set)
    settlements: Set[int] = field(default_factory=set)
    cities: Set[int] = field(default_factory=set)

    @property
    def victory_points(self) -> int:
        return len(self.settlements) + 2 * len(self.cities)

    @property
    def resource_count(self) -> int:
        return sum(self.hand.values())

    def hand_str(self) -> str:
        return ", ".join(f"{r}:{self.hand[r]}" for r in RESOURCES)


@dataclass
class Tile:
    idx: int
    q: int
    r: int
    resource: str
    number: Optional[int]
    nodes: List[int] = field(default_factory=list)


@dataclass
class Node:
    idx: int
    point: Tuple[int, int]
    hexes: List[int] = field(default_factory=list)
    edges: Set[int] = field(default_factory=set)
    owner: Optional[int] = None
    is_city: bool = False


@dataclass
class Edge:
    idx: int
    a: int
    b: int
    owner: Optional[int] = None