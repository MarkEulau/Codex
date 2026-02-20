# utils.py — Pure helper functions (geometry, resource ops, trade validation)

from __future__ import annotations

import math
from typing import Dict, List, Tuple

from catan_models import TradeOffer


def axial_hexes(radius: int = 2) -> List[Tuple[int, int]]:
    """Return all axial hex coordinates within *radius* of the origin."""
    coords: List[Tuple[int, int]] = []
    for q in range(-radius, radius + 1):
        r1 = max(-radius, -q - radius)
        r2 = min(radius, -q + radius)
        for r in range(r1, r2 + 1):
            coords.append((q, r))
    return coords


def hex_center(q: int, r: int) -> Tuple[float, float]:
    """Convert axial hex coordinates to pixel-space center (flat-top layout)."""
    x = math.sqrt(3) * (q + r / 2)
    y = 1.5 * r
    return x, y


def key_point(x: float, y: float) -> Tuple[int, int]:
    """Snap a floating-point coordinate to an integer key for deduplication."""
    return (round(x * 1000), round(y * 1000))


# ── Resource helpers ──────────────────────────────────────────────────────────

def can_afford(hand: Dict[str, int], cost: Dict[str, int]) -> bool:
    return all(hand.get(res, 0) >= amount for res, amount in cost.items())


def pay_cost(hand: Dict[str, int], cost: Dict[str, int]) -> None:
    for res, amount in cost.items():
        hand[res] -= amount


def add_resources(hand: Dict[str, int], gains: Dict[str, int]) -> None:
    for res, amount in gains.items():
        hand[res] += amount


# ── Trade validation ──────────────────────────────────────────────────────────

def validate_trade_offer(payload: Dict[str, object]) -> TradeOffer:
    """Validate a raw trade payload dict and return a strict typed TradeOffer."""
    return TradeOffer.model_validate(payload)