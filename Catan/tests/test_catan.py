from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pydantic import BaseModel, ValidationError

from catan import CatanGame, axial_hexes, validate_trade_offer
from catan_models import GameConfig, HandSnapshot, PlayerConfig, TradeOffer


def test_axial_hexes_default_radius_count() -> None:
    coords = axial_hexes()
    assert len(coords) == 19


def test_setup_places_single_robber_on_desert() -> None:
    game = CatanGame(["A", "B", "C"], seed=42)
    desert_tiles = [tile.idx for tile in game.tiles if tile.resource == "desert"]
    assert len(desert_tiles) == 1
    assert game.robber_tile == desert_tiles[0]


def test_distance_rule_blocks_adjacent_settlement() -> None:
    game = CatanGame(["A", "B", "C"], seed=5)
    node = 0
    ok, _ = game.can_build_settlement(0, node, setup=True)
    assert ok
    game.build_settlement(0, node, free=True, setup=True)

    neighbors = game.node_neighbors(node)
    assert neighbors
    adjacent = next(iter(neighbors))
    ok2, reason = game.can_build_settlement(1, adjacent, setup=True)
    assert not ok2
    assert "Distance rule" in reason


def test_models_are_pydantic_basemodel_subclasses() -> None:
    assert issubclass(PlayerConfig, BaseModel)
    assert issubclass(GameConfig, BaseModel)
    assert issubclass(TradeOffer, BaseModel)
    assert issubclass(HandSnapshot, BaseModel)


def test_trade_offer_validation_rejects_unknown_or_same_resources() -> None:
    with pytest.raises(ValidationError):
        TradeOffer(give_resource="gold", give_amount=1, get_resource="wood", get_amount=1)
    with pytest.raises(ValidationError):
        TradeOffer(give_resource="wood", give_amount=1, get_resource="wood", get_amount=1)


def test_game_config_player_count_validation() -> None:
    players = [PlayerConfig(name="P1"), PlayerConfig(name="P2")]
    with pytest.raises(ValidationError):
        GameConfig(players=players, turn_seconds=60)


def test_validate_trade_offer_adapter() -> None:
    offer = validate_trade_offer(
        {"give_resource": "brick", "give_amount": 2, "get_resource": "ore", "get_amount": 1}
    )
    assert offer.give_resource == "brick"
